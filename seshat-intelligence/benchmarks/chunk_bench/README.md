# chunk_bench: does a chunking strategy find the passage that answers a question?

The shape of chunks (size, tables cut, lost text) is measured by `TestChunkQuality` in the seshat repo. This measures what
they are for: with the chunks of many documents indexed together, is the chunk that holds the answer among the first
results for a natural question, and at what cost in context?

- `questions.json`: 192 questions on 19 documents (papers, a financial presentation, a statistical release, a central bank
  report, an IBM Redbook, a French course book, the Effective Go page, a Python tutorial, a Portuguese statute and an Irish
  budget note as DOCX, a Russian calendar table, a slide deck, a Wikipedia page). Each has the strings that make a chunk an
  answer: the chunk must be from the right document and hold every string of one answer group. Compared without spaces,
  punctuation or ligatures, so a hyphen cut across two lines of a column does not hide an answer.
- `check_questions.py`: checks the questions against the text of the documents before any chunk is made (every answer exists,
  ids are unique). Run it after editing `questions.json`.
- `prepare_corpus.py`: reads `raw/` with the Go reader (`benchmarks/readdoc`) into `md/`.
- `docling_chunks.py`: chunks the files of `raw/` with docling's chunker (`providers/chunker/docling.py`), at its default size,
  512 and 1024 tokens.
- `evaluate.py`: indexes the chunks of each strategy and asks the questions with BM25, with a dense model (all-MiniLM-L6-v2, a
  chunk scored by its best 220-token window) and with the two fused (reciprocal rank). It reports:
  - hit@1/3/5 and MRR, every question counted (a question whose answer is in no chunk is a miss);
  - the answering chunk **within a budget of context tokens**: the results are read in order until N tokens are spent. Bigger
    chunks win the first measure by covering more text per result; this one is what the reader of the results pays;
  - the difference to a baseline (`profile`) with a 95% interval from resampling **documents**, not questions, since the
    questions of a document are not independent. A difference whose interval holds 0 is not a result (marked `*` when it
    does not).

## Reproduce

Everything lives in one directory, `CHUNK_BENCH_DIR`:

1. `raw/`: the original files (the corpus is made of public documents: arXiv papers, Apache POI test files, Wikipedia, the
   Federal Reserve H.8 and FOMC releases, an IBM Redpaper, the Effective Go and Python tutorial pages...).
2. Build the Go reader and read the files:
   `cd benchmarks/readdoc && go build -o $CHUNK_BENCH_DIR/readdoc . && cd ../.. && python benchmarks/chunk_bench/prepare_corpus.py`.
   With no engine, a PDF page with a picture keeps its text and ends with a marker (`[Image 1 on page 3]`), which the chunks
   then hold like any other line.
3. In the seshat repo, with `DOCS` set to the line `prepare_corpus.py` prints:
   `MD_DIR=$CHUNK_BENCH_DIR/md OUT=$CHUNK_BENCH_DIR/chunks_new.jsonl DOCS=... STRATS=paragraph,heading256,heading384,profile,heading768,heading1024,heading2048 go test ./internal/rag -run TestDumpChunksForEvaluation`.
   `profile` is the structured profile (512 tokens); `heading<N>` is the same chunker at N tokens. To compare with an older
   checkout, run it in a `git worktree` of that commit with `OUT=chunks_old.jsonl LABEL=old_`.
4. `python benchmarks/chunk_bench/docling_chunks.py` (long: the conversion of the files takes about 35 minutes on one GPU).
5. `python benchmarks/chunk_bench/check_questions.py`, then `python benchmarks/chunk_bench/evaluate.py` (about 4 minutes).

## Result of 2026-10-04 (seshat v1.2.69, 192 questions, 19 documents)

hit@5 and MRR, every question counted:

| strategy | chunks | avg tokens | BM25 | dense | both |
|---|---|---|---|---|---|
| paragraphs (the old default) | 5921 | 42 | .72 .60 | .69 .53 | .77 .61 |
| docling chunker, default (256) | 1853 | 163 | .84 .71 | .69 .56 | .82 .69 |
| structured, 256 | 1485 | 192 | .90 .76 | .76 .61 | .89 .74 |
| structured, 384 | 954 | 284 | .89 .76 | .78 .62 | .90 .75 |
| docling chunker, 512 | 1020 | 289 | .87 .74 | .81 .63 | .85 .75 |
| **structured, 512 (the profile)** | 703 | 376 | .91 .78 | .85 .67 | .92 .76 |
| docling chunker, 1024 | 676 | 431 | .90 .77 | .81 .67 | .88 .77 |
| structured, 768 | 489 | 532 | .94 .79 | .88 .70 | .94 .80 |
| structured, 1024 | 374 | 691 | .93 .80 | .84 .68 | .93 .80 |
| structured, 2048 | 185 | 1385 | .94 .82 | .90 .77 | .96 .85 |

The answering chunk within N tokens of results (both retrievers fused):

| strategy | 1000 | 2000 | 4000 |
|---|---|---|---|
| structured, 256 | .88 | .95 | .97 |
| structured, 384 | .82 | .91 | .97 |
| **structured, 512 (the profile)** | .84 | .90 | .95 |
| structured, 768 | .76 | .88 | .95 |
| structured, 1024 | .68 | .84 | .92 |
| structured, 2048 | .13 | .72 | .88 |

### 512 or 1024?

Keep 512. Against the profile, fused, over documents, 95% interval:

- **Ranking only**: 1024 is a little better, but not enough to tell from noise (hit@5 +.02 [-.02,+.06]; MRR +.04 [-.01,+.07]).
  Fewer, bigger chunks put more text in each result.
- **At the same context**: 1024 is worse. Within 2000 tokens: -.06 [-.11,-.02]; within 1000: -.16 [-.23,-.09]; within 4000 the
  difference narrows (-.04 [-.08,.00]). Reading the first results costs 1.8 times more tokens for the same chance of holding the
  answer.
- 768 is between the two and not distinguishable from 512 in hit@5 (+.03 [.00,+.06]), MRR, nor within 2000 or 4000 tokens; no
  reason to move.
- 256 is as good as 512 in hit@5 and better under a small budget (+.05 [+.02,+.08] within 2000 tokens, +.02 [+.01,+.04] within
  4000), but cuts more passages (a chunk answering a question that needs a whole paragraph is rarer); this benchmark only asks
  for short facts, so it cannot speak for it.

Other readings:

- Cutting along the structure beats one chunk per paragraph by a wide margin (hit@5 .77 -> .92 fused), whatever the size.
- At 512 and 1024 the structured chunker is equal to docling's own chunker at the same size in MRR, and better in hit@5 at 512
  (+.06 [+.02,+.11] fused), in milliseconds instead of minutes of conversion (docling needed 320 s for the financial
  presentation; four of 192 answers are not in its text, which the native readers wrote).
- The dense model is a small one (MiniLM): numeric and specific questions are found by BM25 and missed by it. A host with a
  better embedder will see different numbers.
- The documents were read without an engine, so a page with pictures ends with markers (`[Image 1 on page 3]`, 213 in the
  corpus). They are part of the chunks, as they will be in a deployment with no engine. A first run, which read the PDFs from
  their text layer with no markers, led to the same decision; there the MRR advantage of 1024 was just outside the noise.

Limits: the questions ask for short facts held by one passage, which suits small chunks; a question that needs a whole section
would favour bigger ones. The answer strings were taken from the text of the native readers. Questions were written by a model
from the text of the documents, not by users; the corpus is mostly scientific papers. Several documents hold text the reader
garbles (the FOMC release has one-letter lines): they are kept, because it is the text the chunkers receive.
