"""Does a chunking strategy put the passage that answers a question in the top results?

It reads every CHUNK_BENCH_DIR/chunks_*.jsonl (one JSON line {"strategy", "doc", "index", "text"} per chunk), indexes the
chunks of all the documents together, once per strategy, and asks the questions of questions.json with BM25, with a dense
model (--embedder: all-MiniLM-L6-v2, which reads 256 tokens, so a chunk is scored by its best 220-token window; or bge-m3, which
reads a whole chunk) and with both fused (reciprocal rank). A chunk answers a question when it is from the right document and holds every string of one
answer group (matching.covers). A question whose answer is in no chunk of a strategy counts as a miss.

Three things are reported, because the first alone favours big chunks (few of them cover a lot of text):

* hit@1/3/5 and MRR: is the answering chunk among the first results, whatever its size.
* hit within a budget of context tokens: is the answering chunk among the results that fit in N tokens. This is what a
  reader of the results pays, and the fair way to compare chunk sizes.
* the difference to a baseline strategy, with a 95% interval. The questions of a document are not independent, so the interval
  comes from resampling documents (a cluster bootstrap), not questions. A difference whose interval holds 0 is not a result.

See README.md for how the chunk files are made."""

import argparse
import glob
import hashlib
import json
import math
import os
import pickle
import sys
from collections import Counter, defaultdict

import numpy as np
from matching import covers, evidence_items, tokens

HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.environ.get("CHUNK_BENCH_DIR", ".")
EMBEDDERS = {
    # English only, 256 tokens: a chunk is scored by its best 220-token window.
    "minilm": {
        "model": "sentence-transformers/all-MiniLM-L6-v2",
        "pooling": "mean",
        "max_length": 256,
        "window": 220,
        "half": False,
        "batch_tokens": 16384,
    },
    # Multilingual, 8192 tokens: a chunk is read whole (up to max_length). Runs in half precision on a GPU with 4 GB.
    "bge-m3": {"model": "BAAI/bge-m3", "pooling": "cls", "max_length": 4096, "window": None, "half": True, "batch_tokens": 4096},
}
RETRIEVERS = ("bm25", "dense", "hybrid")
RRF_K = 60  # reciprocal rank fusion: 1 / (RRF_K + rank)
BOOTSTRAPS = 5000


def load_chunks():
    chunks = defaultdict(list)
    files = sorted(glob.glob(os.path.join(SP, "chunks_*.jsonl")))
    if not files:
        sys.exit(f"no chunks_*.jsonl in {SP}")
    for path in files:
        with open(path, encoding="utf-8") as f:
            for line in f:
                chunk = json.loads(line)
                chunks[chunk["strategy"]].append(chunk)
    return chunks


def chunk_tokens(chunk):
    # The same estimate as the chunkers (a token is about four characters), so that sizes match the profile names.
    return len(chunk["text"]) / 4


class Dense:
    """A dense retriever. A model that reads few tokens (MiniLM: 256) scores a chunk by its best window, so that a long chunk is
    not cut by the model; one that reads a whole chunk (bge-m3: 8192) embeds it as it is."""

    def __init__(self, name):
        import torch
        from transformers import AutoModel, AutoTokenizer

        self.spec = EMBEDDERS[name]
        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tok = AutoTokenizer.from_pretrained(self.spec["model"])
        self.model = AutoModel.from_pretrained(self.spec["model"]).eval()
        if self.spec["half"] and self.device == "cuda":
            self.model = self.model.half()
        self.model = self.model.to(self.device)
        # A slow model is read once per text: the vectors are kept in a file, so that a run that is stopped can go on.
        self.cache_path = os.path.join(SP, f"embeddings_{name}.pkl")
        self.cache = {}
        if os.path.exists(self.cache_path):
            with open(self.cache_path, "rb") as f:
                self.cache = pickle.load(f)

    def save(self):
        with open(self.cache_path, "wb") as f:
            pickle.dump(self.cache, f)

    def embed(self, texts):
        """One normalised vector per text, in order; a text already read comes from the cache."""
        keys = [hashlib.sha1(text.encode("utf-8")).hexdigest() for text in texts]
        todo = sorted({k: t for k, t in zip(keys, texts) if k not in self.cache}.items())
        if todo:
            for (key, _), vector in zip(todo, self.embed_all([text for _, text in todo])):
                self.cache[key] = vector
        return np.stack([self.cache[k] for k in keys])

    def embed_all(self, texts):
        """One normalised vector per text, in order. Texts are read longest last, in batches of about batch_tokens tokens."""
        torch, spec = self.torch, self.spec
        lengths = [len(ids) for ids in self.tok(texts, truncation=True, max_length=spec["max_length"], add_special_tokens=True)["input_ids"]]
        order = sorted(range(len(texts)), key=lambda i: lengths[i])
        vectors = [None] * len(texts)
        start = 0
        with torch.no_grad():
            while start < len(order):
                end = start + 1
                while end < len(order) and (end - start + 1) * lengths[order[end]] <= spec["batch_tokens"]:
                    end += 1
                batch = order[start:end]
                enc = self.tok([texts[i] for i in batch], padding=True, truncation=True, max_length=spec["max_length"], return_tensors="pt").to(
                    self.device
                )
                hidden = self.model(**enc).last_hidden_state.float()
                if spec["pooling"] == "cls":
                    pooled = hidden[:, 0]
                else:
                    mask = enc["attention_mask"].unsqueeze(-1).float()
                    pooled = (hidden * mask).sum(1) / mask.sum(1)
                pooled = torch.nn.functional.normalize(pooled, dim=1).cpu().numpy()
                for row, i in enumerate(batch):
                    vectors[i] = pooled[row]
                start = end
        return np.stack(vectors)

    def windows(self, text, size, stride):
        ids = self.tok(text, add_special_tokens=False)["input_ids"]
        if len(ids) <= size:
            return [text]
        parts = []
        for start in range(0, len(ids), stride):
            parts.append(self.tok.decode(ids[start : start + size]))
            if start + size >= len(ids):
                break
        return parts

    def chunk_scores(self, texts, question_vectors):
        """scores[q, c]: the similarity between question q and chunk c (its best window when the model cannot read it whole)."""
        size = self.spec["window"]
        if not size:
            return question_vectors @ self.embed(texts).T
        windows, first = [], []
        for text in texts:
            first.append(len(windows))
            windows.extend(self.windows(text, size, size // 2))
        window_vectors = self.embed(windows)
        sims = question_vectors @ window_vectors.T  # (questions, windows); windows of one chunk are contiguous
        return np.maximum.reduceat(sims, first, axis=1)


class BM25:
    def __init__(self, texts, k1=1.5, b=0.75):
        docs = [tokens(t) for t in texts]
        self.k1, self.b, self.n = k1, b, len(docs)
        self.lengths = np.array([len(d) for d in docs], dtype=float)
        self.avg_length = self.lengths.mean() if self.n else 0.0
        self.postings = defaultdict(list)  # term -> [(chunk, term frequency)]
        for i, doc in enumerate(docs):
            for term, tf in Counter(doc).items():
                self.postings[term].append((i, tf))

    def scores(self, query):
        scores = np.zeros(self.n)
        for term in set(tokens(query)):
            posting = self.postings.get(term)
            if not posting:
                continue
            idf = math.log(1 + (self.n - len(posting) + 0.5) / (len(posting) + 0.5))
            for i, tf in posting:
                scores[i] += idf * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * self.lengths[i] / self.avg_length))
        return scores


def passage_ranks(scores, relevant):
    """For each passage the answer needs (a row of relevant), the rank of the first chunk that gives it, or None. Also returns the
    order of the chunks."""
    order = np.argsort(-scores, kind="stable")
    ranks = []
    for row in relevant:
        hits = np.flatnonzero(row[order])
        ranks.append(int(hits[0]) + 1 if len(hits) else None)
    return ranks, order


def evaluate_strategy(chunks, questions, dense, question_vectors):
    texts = [c["text"] for c in chunks]
    costs = np.array([chunk_tokens(c) for c in chunks])
    # relevant[q][p][c]: chunk c gives passage p of question q (one passage for a question with "answers").
    relevant = [np.array([[covers(c, q["doc"], groups) for c in chunks] for groups in evidence_items(q)]) for q in questions]
    bm25 = BM25(texts)
    dense_scores = dense.chunk_scores(texts, question_vectors)
    results = {r: {"passages": [], "rank": [], "cost": []} for r in RETRIEVERS}
    for qi, question in enumerate(questions):
        b = bm25.scores(question["q"])
        d = dense_scores[qi]
        # Reciprocal rank fusion of the two rankings.
        rb = np.argsort(np.argsort(-b, kind="stable"), kind="stable")
        rd = np.argsort(np.argsort(-d, kind="stable"), kind="stable")
        fused = 1 / (RRF_K + rb) + 1 / (RRF_K + rd)
        for name, scores in (("bm25", b), ("dense", d), ("hybrid", fused)):
            ranks, order = passage_ranks(scores, relevant[qi])
            results[name]["passages"].append(ranks)
            # The answer is complete when its last passage is: the rank, and the tokens read up to there.
            if None in ranks:
                results[name]["rank"].append(None)
                results[name]["cost"].append(None)
            else:
                last = max(ranks)
                results[name]["rank"].append(last)
                results[name]["cost"].append(float(costs[order[:last]].sum()))
    return {
        "chunks": len(chunks),
        "avg_tokens": float(costs.mean()),
        "answerable": sum(1 for rows in relevant if rows.any(axis=1).all()),
        "passages": {name: r["passages"] for name, r in results.items()},
        "ranks": {name: r["rank"] for name, r in results.items()},
        "costs": {name: r["cost"] for name, r in results.items()},
    }


def per_question(result, retriever, metric, budgets):
    """One number per question for a metric. "hit@K" is 1 when the whole answer is in the first K results (every passage it
    needs), "cov@K" is the share of its passages that are, "hit@Ntok" is 1 when the whole answer is in the results that fit
    in N tokens, "mrr" is 1 / the rank at which the answer is complete."""
    ranks, costs = result["ranks"][retriever], result["costs"][retriever]
    if metric == "mrr":
        return np.array([1 / r if r else 0.0 for r in ranks])
    if metric.endswith("tok"):
        budget = budgets[metric]
        return np.array([1.0 if c is not None and c <= budget else 0.0 for c in costs])
    if metric.startswith("cov@"):
        k = int(metric.removeprefix("cov@"))
        return np.array([np.mean([1.0 if r and r <= k else 0.0 for r in rs]) for rs in result["passages"][retriever]])
    k = int(metric.removeprefix("hit@"))
    return np.array([1.0 if r and r <= k else 0.0 for r in ranks])


def cluster_bootstrap(values_a, values_b, doc_ids, rng):
    """Mean of a - b over the questions, with a 95% interval from resampling whole documents."""
    diff = values_a - values_b
    docs = sorted(set(doc_ids))
    index = {d: np.flatnonzero(np.array(doc_ids) == d) for d in docs}
    sums = np.array([diff[index[d]].sum() for d in docs])
    counts = np.array([len(index[d]) for d in docs], dtype=float)
    picks = rng.integers(0, len(docs), size=(BOOTSTRAPS, len(docs)))
    boot = sums[picks].sum(axis=1) / counts[picks].sum(axis=1)
    return diff.mean(), np.percentile(boot, 2.5), np.percentile(boot, 97.5)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--baseline", default="profile", help="the strategy the others are compared with (default: profile)")
    parser.add_argument("--budgets", default="1000,2000,4000", help="context budgets in tokens, comma separated")
    parser.add_argument("--only", default="", help="strategies to evaluate, comma separated (default: all)")
    parser.add_argument("--embedder", default="minilm", choices=sorted(EMBEDDERS), help="the dense model (default: minilm)")
    parser.add_argument("--questions", default="questions.json", help="the questions, in this directory (default: questions.json)")
    args = parser.parse_args()

    questions = json.load(open(os.path.join(HERE, args.questions), encoding="utf-8"))
    multi = any(len(evidence_items(q)) > 1 for q in questions)
    budgets = {f"hit@{b}tok": int(b) for b in args.budgets.split(",")}
    chunks = load_chunks()
    if args.only:
        chunks = {name: chunks[name] for name in args.only.split(",")}
    docs = {c["doc"] for cs in chunks.values() for c in cs}
    missing = sorted({q["doc"] for q in questions} - docs)
    if missing:
        sys.exit(f"no chunk for the documents of some questions: {missing}")

    dense = Dense(args.embedder)
    question_vectors = dense.embed([q["q"] for q in questions])
    results = {}
    for name in sorted(chunks, key=lambda n: sum(map(chunk_tokens, chunks[n])) / len(chunks[n])):
        print(f"evaluating {name} ({len(chunks[name])} chunks)", file=sys.stderr)
        results[name] = evaluate_strategy(chunks[name], questions, dense, question_vectors)
        dense.save()
    names = list(results)
    doc_ids = [q["doc"] for q in questions]
    n = len(questions)
    print(f"\n{n} questions on {len(set(doc_ids))} documents, dense model: {EMBEDDERS[args.embedder]['model']}\n")

    what = "the whole answer (every passage it needs) in the first k results" if multi else "the answer in the first k results"
    print(f"hit@1 hit@3 hit@5 MRR: {what}; every question counted (an answer that is in no chunk is a miss)\n")
    print(f"{'strategy':14s} {'chunks':>6s} {'avg tok':>7s} {'answerable':>10s} | " + " | ".join(f"{r:^23s}" for r in RETRIEVERS))
    for name in names:
        r = results[name]
        cells = []
        for retriever in RETRIEVERS:
            m = [per_question(r, retriever, k, budgets).mean() for k in ("hit@1", "hit@3", "hit@5", "mrr")]
            cells.append(" ".join(f"{x:.2f}" for x in m).center(23))
        print(f"{name:14s} {r['chunks']:6d} {r['avg_tokens']:7.0f} {r['answerable']:>7d}/{n} | " + " | ".join(cells))

    print("\nanswering chunk within a budget of context tokens (the results are read in order until the budget is spent)\n")
    print(f"{'strategy':14s} | " + " | ".join(f"{r + ' ' + ' '.join(str(b) for b in budgets.values()):^24s}" for r in RETRIEVERS))
    for name in names:
        cells = []
        for retriever in RETRIEVERS:
            m = [per_question(results[name], retriever, metric, budgets).mean() for metric in budgets]
            cells.append(" ".join(f"{x:.2f}" for x in m).center(24))
        print(f"{name:14s} | " + " | ".join(cells))

    if args.baseline in results:
        rng = np.random.default_rng(0)
        metrics = (["hit@5", "cov@5", "mrr"] if multi else ["hit@5", "mrr"]) + list(budgets)
        for retriever in RETRIEVERS:
            print(
                f"\ndifference to {args.baseline} with {retriever} (positive: better than {args.baseline}; 95% interval over documents; * when it excludes 0)\n"
            )
            print(f"{'strategy':14s} | " + " | ".join(f"{m:^24s}" for m in metrics))
            for name in names:
                if name == args.baseline:
                    continue
                cells = []
                for metric in metrics:
                    a = per_question(results[name], retriever, metric, budgets)
                    b = per_question(results[args.baseline], retriever, metric, budgets)
                    mean, low, high = cluster_bootstrap(a, b, doc_ids, rng)
                    star = "*" if low > 0 or high < 0 else " "
                    cells.append(f"{mean:+.3f} [{low:+.3f},{high:+.3f}]{star}".center(24))
                print(f"{name:14s} | " + " | ".join(cells))
    else:
        print(f"\nno strategy named {args.baseline}: no comparison", file=sys.stderr)

    per_doc = {}
    for name in names:
        per_doc[name] = {}
        for doc in sorted(set(doc_ids)):
            picks = [i for i, d in enumerate(doc_ids) if d == doc]
            per_doc[name][doc] = {r: float(per_question(results[name], r, "hit@5", budgets)[picks].mean()) for r in RETRIEVERS}
    out = {"questions": n, "strategies": results, "hit@5_by_document": per_doc}
    suffix = "" if args.questions == "questions.json" else "_" + os.path.splitext(args.questions)[0]
    with open(os.path.join(SP, f"results_{args.embedder}{suffix}.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
