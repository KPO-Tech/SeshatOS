"""Does a chunking strategy put the passage that answers a question in the top results?

It reads every CHUNK_BENCH_DIR/chunks_*.jsonl (one JSON line {"strategy", "doc", "index", "text"} per chunk), indexes the
chunks of all the documents together, once per strategy, and asks the questions of questions.json with BM25, with a dense
model (all-MiniLM-L6-v2, a chunk scored by its best 220-token window so that a long chunk is not cut by the model) and with
both fused (reciprocal rank). A chunk answers a question when it is from the right document and holds every string of one
answer group (matching.is_answer). A question whose answer is in no chunk of a strategy counts as a miss.

Three things are reported, because the first alone favours big chunks (few of them cover a lot of text):

* hit@1/3/5 and MRR: is the answering chunk among the first results, whatever its size.
* hit within a budget of context tokens: is the answering chunk among the results that fit in N tokens. This is what a
  reader of the results pays, and the fair way to compare chunk sizes.
* the difference to a baseline strategy, with a 95% interval. The questions of a document are not independent, so the interval
  comes from resampling documents (a cluster bootstrap), not questions. A difference whose interval holds 0 is not a result.

See README.md for how the chunk files are made."""

import argparse
import glob
import json
import math
import os
import sys
from collections import Counter, defaultdict

import numpy as np
from matching import is_answer, tokens

HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.environ.get("CHUNK_BENCH_DIR", ".")
EMBEDDER = "sentence-transformers/all-MiniLM-L6-v2"
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
    def __init__(self):
        import torch
        from transformers import AutoModel, AutoTokenizer

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tok = AutoTokenizer.from_pretrained(EMBEDDER)
        self.model = AutoModel.from_pretrained(EMBEDDER).to(self.device).eval()

    def embed(self, texts, batch=64):
        torch = self.torch
        out = []
        with torch.no_grad():
            for i in range(0, len(texts), batch):
                enc = self.tok(texts[i : i + batch], padding=True, truncation=True, max_length=256, return_tensors="pt").to(self.device)
                hidden = self.model(**enc).last_hidden_state
                mask = enc["attention_mask"].unsqueeze(-1).float()
                pooled = (hidden * mask).sum(1) / mask.sum(1)
                out.append(torch.nn.functional.normalize(pooled, dim=1).cpu())
        return torch.cat(out).numpy()

    def windows(self, text, size=220, stride=110):
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
        """scores[q, c]: the best similarity between question q and a window of chunk c."""
        windows, first = [], []
        for text in texts:
            first.append(len(windows))
            windows.extend(self.windows(text))
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


def rank_with_cost(scores, relevant, costs):
    """The rank of the first answering chunk and the tokens of all the results up to and including it (None, None: a miss)."""
    order = np.argsort(-scores, kind="stable")
    hits = np.flatnonzero(relevant[order])
    if not len(hits):
        return None, None
    first = int(hits[0])
    return first + 1, float(costs[order[: first + 1]].sum())


def evaluate_strategy(chunks, questions, dense, question_vectors):
    texts = [c["text"] for c in chunks]
    costs = np.array([chunk_tokens(c) for c in chunks])
    relevant = np.array([[is_answer(c, q) for c in chunks] for q in questions])  # (questions, chunks)
    bm25 = BM25(texts)
    dense_scores = dense.chunk_scores(texts, question_vectors)
    results = {r: [] for r in RETRIEVERS}
    for qi, question in enumerate(questions):
        b = bm25.scores(question["q"])
        d = dense_scores[qi]
        # Reciprocal rank fusion of the two rankings.
        rb = np.argsort(np.argsort(-b, kind="stable"), kind="stable")
        rd = np.argsort(np.argsort(-d, kind="stable"), kind="stable")
        fused = 1 / (RRF_K + rb) + 1 / (RRF_K + rd)
        for name, scores in (("bm25", b), ("dense", d), ("hybrid", fused)):
            if not relevant[qi].any():
                results[name].append((None, None))
            else:
                results[name].append(rank_with_cost(scores, relevant[qi], costs))
    return {
        "chunks": len(chunks),
        "avg_tokens": float(costs.mean()),
        "answerable": int(relevant.any(axis=1).sum()),
        "ranks": {name: [r for r, _ in rs] for name, rs in results.items()},
        "costs": {name: [c for _, c in rs] for name, rs in results.items()},
    }


def per_question(result, retriever, metric, budgets):
    """One number per question for a metric: "hit@K" and "hit@Ntok" are 0 or 1, "mrr" is 1/rank."""
    ranks, costs = result["ranks"][retriever], result["costs"][retriever]
    if metric == "mrr":
        return np.array([1 / r if r else 0.0 for r in ranks])
    if metric.endswith("tok"):
        budget = budgets[metric]
        return np.array([1.0 if c is not None and c <= budget else 0.0 for c in costs])
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
    args = parser.parse_args()

    questions = json.load(open(os.path.join(HERE, "questions.json"), encoding="utf-8"))
    budgets = {f"hit@{b}tok": int(b) for b in args.budgets.split(",")}
    chunks = load_chunks()
    if args.only:
        chunks = {name: chunks[name] for name in args.only.split(",")}
    docs = {c["doc"] for cs in chunks.values() for c in cs}
    missing = sorted({q["doc"] for q in questions} - docs)
    if missing:
        sys.exit(f"no chunk for the documents of some questions: {missing}")

    dense = Dense()
    question_vectors = dense.embed([q["q"] for q in questions])
    results = {}
    for name in sorted(chunks, key=lambda n: sum(map(chunk_tokens, chunks[n])) / len(chunks[n])):
        print(f"evaluating {name} ({len(chunks[name])} chunks)", file=sys.stderr)
        results[name] = evaluate_strategy(chunks[name], questions, dense, question_vectors)
    names = list(results)
    doc_ids = [q["doc"] for q in questions]
    n = len(questions)
    print(f"\n{n} questions on {len(set(doc_ids))} documents\n")

    print("hit@1 hit@3 hit@5 MRR, every question counted (a question whose answer is in no chunk is a miss)\n")
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
        metrics = ["hit@5", "mrr"] + list(budgets)
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
    with open(os.path.join(SP, "results.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
