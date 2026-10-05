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
5. `python benchmarks/chunk_bench/check_questions.py`, then `python benchmarks/chunk_bench/evaluate.py` (about 4 minutes), and
   `evaluate.py --embedder bge-m3` for the multilingual model (2.3 GB downloaded from Hugging Face on first use; about 10
   minutes per strategy on a 4 GB GPU, `--only profile,heading768` to choose; the vectors are kept in `embeddings_bge-m3.pkl`,
   so a stopped run goes on where it was).

## Result of 2026-10-04 (seshat v1.2.70, 192 questions, 19 documents)

hit@5 and MRR, every question counted:

| strategy | chunks | avg tokens | BM25 | dense | both |
|---|---|---|---|---|---|
| paragraphs (the old default) | 4714 | 53 | .73 .62 | .69 .53 | .77 .62 |
| docling chunker, default (256) | 1853 | 163 | .85 .71 | .70 .57 | .82 .70 |
| structured, 256 | 1486 | 193 | .90 .77 | .78 .62 | .90 .74 |
| structured, 384 | 955 | 284 | .89 .77 | .79 .65 | .92 .76 |
| docling chunker, 512 | 1020 | 289 | .88 .75 | .81 .63 | .86 .76 |
| **structured, 512 (the profile)** | 701 | 377 | .92 .79 | .85 .68 | .90 .77 |
| docling chunker, 1024 | 676 | 431 | .90 .78 | .81 .67 | .89 .78 |
| structured, 768 | 488 | 532 | .95 .80 | .86 .73 | .96 .81 |
| structured, 1024 | 372 | 694 | .93 .81 | .85 .70 | .93 .80 |
| structured, 2048 | 185 | 1383 | .94 .82 | .89 .76 | .96 .83 |

The answering chunk within N tokens of results (both retrievers fused):

| strategy | 1000 | 2000 | 4000 |
|---|---|---|---|
| structured, 256 | .89 | .95 | .97 |
| structured, 384 | .84 | .93 | .96 |
| **structured, 512 (the profile)** | .82 | .89 | .96 |
| structured, 768 | .77 | .89 | .96 |
| structured, 1024 | .68 | .83 | .93 |
| structured, 2048 | .15 | .68 | .85 |

### 512, 768 or 1024?

1024 is not the answer, and 512 is a sound default. With MiniLM, 768 looked like it might be better; with a stronger embedder (next
section) it is not, and 256 is. Against the profile, fused, over documents, 95% interval, with MiniLM:

- **1024**: ranks the answer a little better (hit@5 +.03 [.00,+.07]) but costs 1.8 times more tokens for it. At the same context it
  is worse: within 2000 tokens -.05 [-.10,-.01], within 1000 -.14 [-.21,-.07].
- **768**: better at ranking (hit@5 +.06 [+.02,+.10]; MRR +.03 [-.01,+.07], not clear) and the same at 2000 and 4000 tokens (+.01
  [-.05,+.06], +.01 [-.02,+.03]); under the tightest budget it is a little worse (-.05 [-.12,+.02], not clear). The gain is on
  one measure of the four, with the intervals of the others holding 0, so it is a lead, not a result. Before moving the profile it
  should be tried with a better embedder (done below: the lead disappears) and with questions that need a whole section.
- **256**: as good as 512 in hit@5 (-.01 [-.04,+.03]) and better under a small budget (+.07 [+.01,+.13] within 1000 tokens, +.07
  [+.02,+.12] within 2000), but it cuts more passages; this benchmark only asks for short facts, so it cannot speak for a question
  that needs a paragraph.

### With a stronger embedder (bge-m3)

MiniLM is small and English only. The same chunks, with `--embedder bge-m3` (BAAI/bge-m3, multilingual, reads a whole chunk up to
4096 tokens, half precision on a 4 GB GPU, about 10 minutes per strategy):

| strategy | BM25 hit@5 MRR | dense hit@5 MRR | both hit@5 MRR | both within 1000 / 2000 / 4000 tokens |
|---|---|---|---|---|
| structured, 256 | .90 .77 | .88 .77 | .95 .82 | .95 / .98 / .98 |
| **structured, 512 (the profile)** | .92 .79 | .84 .70 | .91 .77 | .81 / .90 / .96 |
| structured, 768 | .95 .80 | .83 .69 | .91 .79 | .74 / .85 / .94 |
| structured, 1024 | .93 .81 | .84 .69 | .92 .80 | .70 / .81 / .91 |

Against the profile, fused, 95% interval over documents:

- **768 is not better than 512** any more: hit@5 +.01 [-.02,+.03], MRR +.02 [-.01,+.05], and worse at equal context (-.07
  [-.11,-.03] within 1000 tokens, -.04 [-.08,-.01] within 2000). The lead seen with MiniLM came from that model.
- **1024 is worse at equal context** (-.11 [-.19,-.04] within 1000, -.08 [-.13,-.04] within 2000, -.06 [-.10,-.02] within 4000) and
  not better at ranking (hit@5 +.01 [-.02,+.04]).
- **256 is better than 512**: hit@5 +.04 [+.01,+.07], and clearly under a budget (+.14 [+.08,+.21] within 1000 tokens, +.08
  [+.04,+.13] within 2000). With the dense model alone the dense score of a chunk falls as chunks grow (hit@5 .88, .84, .83, .84):
  a vector of a long chunk averages several subjects. This benchmark asks for short facts, which is where small chunks win by
  construction, so it settles that bigger is not better, not that 256 is the right size: a question that needs a paragraph or a
  section would say the opposite.

So the decision is: do not raise the size above 512. Whether to go below it depends on the questions the product is asked,
which this set does not cover; the next measure to make is a set of questions whose answer needs more than one passage.

Other readings:

- Cutting along the structure beats one chunk per paragraph by a wide margin (hit@5 .77 -> .90 to .96 fused), whatever the size.
- At 512 and 1024 the structured chunker is equal to docling's own chunker at the same size in MRR, and better in hit@5 at 512
  with BM25 (+.04 [+.01,+.09]), in milliseconds instead of minutes of conversion (docling needed 320 s for the financial
  presentation; three of 192 answers are not in its text, which the native readers wrote).
- The dense model is a small one (MiniLM): numeric and specific questions are found by BM25 and missed by it. A host with a
  better embedder will see different numbers.
- The documents were read without an engine: a page with pictures ends with markers (`[Image 1 on page 3]`, a few hundred in the
  corpus) that the chunks hold like any other line. Earlier runs, on text where two-column papers were read as lists of short
  lines, hyphenated words were left in two and ligatures were dropped, already put 768 ahead of 512 in hit@5 (+.03 [.00,+.06]),
  without being clear; reading the PDFs properly (seshat v1.2.70) made the gap clearer (+.06 [+.02,+.10]). A chunk size is only
  as good as the text it cuts.

Limits: the questions ask for short facts held by one passage, which suits small chunks; a question that needs a whole section
would favour bigger ones. The answer strings were taken from the text of the native readers. Questions were written by a model
from the text of the documents, not by users; the corpus is mostly scientific papers. Some documents still hold text the reader
garbles (the table of the FOMC release has repeated cells): they are kept, because it is the text the chunkers receive.
