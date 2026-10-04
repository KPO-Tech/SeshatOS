# chunk_bench: does a chunking strategy find the passage that answers a question?

The shape of chunks (size, tables cut, lost text) is measured by `TestChunkQuality` in the seshat repo. This measures what
they are for: with the chunks of several documents indexed together, is the chunk that holds the answer among the first
results for a natural question?

- `questions.json`: 42 questions on 7 documents (a paper, a financial presentation, two other papers, a web page, a
  Portuguese statute as DOCX, a slide deck). Each has the strings that make a chunk an answer: the chunk must be from the
  right document and hold every string of one answer group.
- `evaluate.py`: indexes every strategy's chunks and asks the questions with BM25, with a dense model (all-MiniLM-L6-v2, a
  chunk scored by its best 256-token window so that a long chunk is not cut by the model's limit) and with the two fused (reciprocal
  rank). Reports hit@1/3/5 and MRR over all questions; a question whose answer is in no chunk of a strategy is a miss.
- `docling_chunks.py`: chunks the original files with docling's chunker (`providers/chunker/docling.py`), at its default size and
  at 512 tokens.

## Reproduce

Everything lives in one directory, `CHUNK_BENCH_DIR`:

1. `raw/`: the seven original files named in `docling_chunks.py` (the Apache POI, arXiv and Wikipedia documents of the corpus).
2. `md/<name>.md`: what the native readers write for them (`documentreading.Convert`).
3. `chunks_new.jsonl`, `chunks_old.jsonl`: one JSON line `{"strategy", "doc", "index", "text"}` per chunk. In the seshat repo,
   `MD_DIR=<dir>/md OUT=<dir>/chunks_new.jsonl DOCS=<names, comma separated> STRATS=heading512,heading1024,paragraph go test ./internal/rag -run TestDumpChunksForEvaluation`.
   For a comparison with an older chunker, run the same command in a checkout (`git worktree`) of the commit to compare, with
   `OUT=chunks_old.jsonl` and the strategies it has (`heading1024,paragraph`).
4. `python docling_chunks.py` writes `chunks_docling.jsonl` (minutes: it converts the documents with docling).

Then `CHUNK_BENCH_DIR=<dir> python evaluate.py`.

## Result of 2026-10-04 (seshat v1.2.66 chunker, 42 questions)

hit@1, hit@3, hit@5 and MRR, all questions counted:

| strategy | chunks | avg tokens | BM25 | dense | both |
|---|---|---|---|---|---|
| paragraphs (the old default) | 1115 | 47 | .64 .74 .81 .73 | .50 .71 .81 .64 | .60 .79 .90 .71 |
| old heading chunker, 1024 | 277 | 190 | .79 .93 .98 .86 | .69 .86 .86 .78 | .74 .88 .98 .83 |
| new markdown chunker, 1024 | 81 | 658 | .81 1.00 1.00 .90 | .71 .95 .98 .84 | .81 .98 1.00 .89 |
| new markdown chunker, 512 (the profile) | 154 | 350 | .81 .93 .95 .88 | .64 .86 .93 .77 | .79 .90 .98 .86 |
| docling chunker, default (256) | 385 | 158 | .69 .88 .93 .79 | .60 .83 .86 .70 | .62 .88 .95 .75 |
| docling chunker, 512 | 218 | 276 | .71 .93 .95 .81 | .67 .88 .90 .77 | .79 .93 .98 .85 |

What it shows, and what it does not:

- Cutting along the structure and packing (any of the heading chunkers) is clearly better than one chunk per paragraph: hit@5 .81 -> .95 to 1.00 with BM25.
- The new chunker is a little better than the old one (hit@3 .93 -> .93 to 1.00, MRR .86 -> .88 to .90) on this set; the difference is within what two or three questions change (one question is 2.4 points).
- At 512 tokens it matches the external docling chunker at the same size, in milliseconds instead of tens of seconds of conversion.
- 512 versus 1024 is not settled: 1024 recalls a little more in the top 3 (fewer, bigger chunks), but the sample is too small to say, and a bigger chunk costs the model that reads it. The set should grow before the profile is changed.
- The dense model here is a small one (MiniLM): numeric and specific questions ("how many pages", "how far behind") are found by BM25 and missed by it, and fusing with equal weight can then lower the rank. A host with a better embedder will see different numbers.
- The answer strings were taken from the native readers' text. They are compared without spaces or punctuation so that a reader writing "non - GAAP" or "TensorRTTLLM" is not counted as having lost the answer; one question is still absent from the docling chunks.
