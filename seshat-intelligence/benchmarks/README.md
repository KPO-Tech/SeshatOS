# Reading benchmark

Compares document readers on your own documents. Run it before deciding which reader a corpus should
use, and again before changing a routing rule: a rule like "send this kind of page to Marker" should
rest on a measurement, not a guess.

## Readers

| name | what it runs | per-page text |
|---|---|---|
| `go` | the Go reader (`readdoc`), native only | PDF: yes |
| `service-custom` | seshat-intelligence, native-first routing with engines | no |
| `service-docling` | seshat-intelligence, Docling alone | no |
| `service-marker` | seshat-intelligence, Marker for PDFs | no |
| `docling-chunks` | docling-serve's hybrid chunk endpoint, what Knowledge indexes today | yes, from the chunks |

The `service-*` readers get one markdown back, so their page accuracy is `-`. `docling-chunks` keeps
the page and heading path Docling read from its structured document, which the markdown export drops.

## What is measured

Each check answers one question. None is a single quality score, and a check with no expectation, or
that a reader cannot answer, is `-`, never 0.

- **phrase recall**: is the text there at all.
- **reading order**: of the phrases found, how many come in the order you listed them. Interleaved
  columns score low.
- **heading recall**: are section titles real markdown headings.
- **table rows intact**: does a table row stay on one table line. Text that has the right words but lost
  the table scores 0 here and 1 on **table text present**, so structure loss is not mistaken for missing text.
- **page accuracy**: is a phrase attributed to the page it is on.
- also seconds per document, garbled output, and read/failed counts.

These are proxies. Read the dumps (`--dump-dir`) for the documents that matter.

## Use

```bash
cd seshat-intelligence
uv sync

# 1. A manifest listing the documents, to fill in what each one contains.
PYTHONPATH=benchmarks uv run python -m reading_bench init ~/docs > manifest.json

# 2. The Go reader.
(cd benchmarks/readdoc && GOWORK=off go build -o ../../readdoc .)

# 3. The services (optional, each only if you compare it).
uv run main.py                 # seshat-intelligence on :5100
docling-serve run              # docling-serve on :5001, for docling-chunks

# 4. Run.
PYTHONPATH=benchmarks uv run python -m reading_bench run ~/docs --manifest manifest.json \
  --readers go,service-custom,service-docling,docling-chunks \
  --go-binary ./readdoc --dump-dir dump --out report.md
```

Docling downloads its models on first use. Marker needs `uv sync --extra marker` and its model weights are
free only for research, personal use and small companies; check that before using it in a product.

## What to put in a manifest

For each document, a few things you can verify by eye in a minute:

```json
{"documents": {"contract.pdf": {
  "phrases": ["Article 1", "Termination", "Governing law"],
  "headings": ["Termination"],
  "tables": [[["Item", "Price"], ["Support", "1200"]]],
  "pages": {"Governing law": 7}
}}}
```

A document with no expectations still runs and is scored for time, size, headings found and garbled
output, so you can start with a folder and add expectations where a reader's output looks wrong.
