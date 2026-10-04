"""Does a chunking strategy put the passage that answers a question in the top results?

For every strategy it finds, in CHUNK_BENCH_DIR/chunks_{old,new,docling}.jsonl, it indexes the chunks of all the documents
together and asks the questions of questions.json, with BM25, with a dense model (all-MiniLM-L6-v2, a chunk scored by its best
256-token window so that a long chunk is not cut) and with both fused (reciprocal rank). A chunk answers a question when it is
from the right document and holds every string of one answer group (compared without spaces or punctuation). A question
whose answer is in no chunk of a strategy counts as a miss. See README.md for how the chunk files are made."""


import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.environ.get("CHUNK_BENCH_DIR", ".")
QUESTIONS = json.load(open(os.path.join(HERE, "questions.json"), encoding="utf-8"))

RENAME = {("old", "heading1024"): "old_heading1024", ("old", "paragraph"): "paragraph(default)", ("new", "heading512"): "new_heading512", ("new", "heading1024"): "new_heading1024"}
chunks = defaultdict(list)  # strategy -> list of dict
for tag in ("old", "new", "docling"):
    try:
        for line in open(os.path.join(SP, f"chunks_{tag}.jsonl"), encoding="utf-8"):
            c = json.loads(line)
            name = RENAME.get((tag, c["strategy"]), c["strategy"])
            if tag == "new" and c["strategy"] == "paragraph":
                continue  # same code as before
            chunks[name].append(c)
    except FileNotFoundError:
        print("missing", tag, file=sys.stderr)

LIG = {"\ufb01": "fi", "\ufb02": "fl", "\ufb00": "ff", "\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-", "\u00a0": " "}


def norm(s):
    # Compared without spaces or punctuation: a reader that writes "non - GAAP" or "TensorRTTLLM" has not lost the answer.
    for k, v in LIG.items():
        s = s.replace(k, v)
    return re.sub(r"[\W_]+", "", s.lower())


def tokens(s):
    return re.findall(r"[\w]+", s.lower())


device = "cuda" if torch.cuda.is_available() else "cpu"
tok = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
model = AutoModel.from_pretrained("sentence-transformers/all-MiniLM-L6-v2").to(device).eval()


@torch.no_grad()
def embed(texts, bs=64):
    out = []
    for i in range(0, len(texts), bs):
        enc = tok(texts[i : i + bs], padding=True, truncation=True, max_length=256, return_tensors="pt").to(device)
        h = model(**enc).last_hidden_state
        m = enc["attention_mask"].unsqueeze(-1).float()
        v = (h * m).sum(1) / m.sum(1)
        out.append(torch.nn.functional.normalize(v, dim=1).cpu())
    return torch.cat(out)


def windows(text, size=220, stride=110):
    ids = tok(text, add_special_tokens=False)["input_ids"]
    if len(ids) <= size:
        return [text]
    parts = []
    for s in range(0, len(ids), stride):
        parts.append(tok.decode(ids[s : s + size]))
        if s + size >= len(ids):
            break
    return parts


def bm25_scores(docs_tokens, query_tokens, k1=1.5, b=0.75):
    N = len(docs_tokens)
    avgdl = sum(len(d) for d in docs_tokens) / max(N, 1)
    df = Counter()
    for d in docs_tokens:
        df.update(set(d))
    scores = np.zeros(N)
    for i, d in enumerate(docs_tokens):
        tf = Counter(d)
        dl = len(d)
        s = 0.0
        for t in query_tokens:
            if t not in tf:
                continue
            idf = math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * dl / avgdl))
        scores[i] = s
    return scores


def relevant(chunk, q):
    if chunk["doc"] != q["doc"]:
        return False
    t = norm(chunk["text"])
    return any(all(norm(a) in t for a in group) for group in q["answers"])


qvecs = embed([q["q"] for q in QUESTIONS])

results = {}
for name, cs in chunks.items():
    texts = [c["text"] for c in cs]
    btok = [tokens(t) for t in texts]
    # dense with windows: embed every window, chunk score = max over its windows
    win_texts, owner = [], []
    for i, t in enumerate(texts):
        for w in windows(t):
            win_texts.append(w)
            owner.append(i)
    wv = embed(win_texts)
    owner = np.array(owner)
    rel = [[relevant(c, q) for c in cs] for q in QUESTIONS]
    answerable = [any(r) for r in rel]
    metrics = {}
    ranks = {}
    for retr in ("bm25", "dense", "hybrid"):
        hits = Counter()
        rr = 0.0
        n = 0
        ranks[retr] = {}
        for qi, q in enumerate(QUESTIONS):
            n += 1
            if not answerable[qi]:
                ranks[retr][q['id']] = None
                continue  # the answer is in no chunk of this strategy: a miss
            b = bm25_scores(btok, tokens(q["q"]))
            sims = (wv @ qvecs[qi]).numpy()
            d = np.full(len(cs), -1.0)
            for wi, o in enumerate(owner):
                if sims[wi] > d[o]:
                    d[o] = sims[wi]
            if retr == "bm25":
                score = b
            elif retr == "dense":
                score = d
            else:  # reciprocal rank fusion
                rb = np.argsort(-b).argsort()
                rd = np.argsort(-d).argsort()
                score = 1 / (60 + rb) + 1 / (60 + rd)
            order = np.argsort(-score)
            rank = next((r + 1 for r, idx in enumerate(order) if rel[qi][idx]), None)
            ranks[retr][q['id']] = rank
            if rank:
                rr += 1 / rank
                for k in (1, 3, 5):
                    if rank <= k:
                        hits[k] += 1
        metrics[retr] = {"hit@1": hits[1] / n, "hit@3": hits[3] / n, "hit@5": hits[5] / n, "mrr": rr / n}
    lens = [len(t) / 4 for t in texts]
    results[name] = {
        "chunks": len(cs),
        "avg_tokens": sum(lens) / len(lens),
        "answerable": f"{sum(answerable)}/{len(QUESTIONS)}",
        "metrics": metrics,
        "ranks": ranks,
    }

order = ["paragraph(default)", "old_heading1024", "new_heading1024", "new_heading512", "docling_default", "docling512"]
print(f"{'strategy':20s} {'chunks':>6s} {'avgTok':>6s} {'answerable':>10s} | " + " | ".join(f"{r:^26s}" for r in ("bm25", "dense", "hybrid")))
print(f"{'':20s} {'':>6s} {'':>6s} {'':>10s} | " + " | ".join(f"{'@1   @3   @5   MRR':^26s}" for _ in range(3)))
for name in order:
    if name not in results:
        continue
    r = results[name]
    cells = []
    for retr in ("bm25", "dense", "hybrid"):
        m = r["metrics"][retr]
        cells.append(f"{m['hit@1']:.2f} {m['hit@3']:.2f} {m['hit@5']:.2f} {m['mrr']:.2f}".center(26))
    print(f"{name:20s} {r['chunks']:6d} {r['avg_tokens']:6.0f} {r['answerable']:>10s} | " + " | ".join(cells))
json.dump(results, open(os.path.join(SP, "results.json"), "w"), indent=1)
