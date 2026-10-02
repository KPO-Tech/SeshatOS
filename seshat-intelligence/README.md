# seshat-intelligence

SeshatOS's own AI capabilities server. One well-organized service instead of
one deployment per feature - see the architecture discussion that led here.
Each capability domain (`documents` now, `retrieval`/`evaluation` later) is
its own top-level package with its own routes/schemas/service, mounted onto
one shared FastAPI app. Voice is deliberately not planned to live here - a
real-time WebSocket workload has too different an operational profile to
share a process with batch/CPU-bound work like document conversion; it gets
its own service later.

## Responsibility boundary

`seshat-intelligence` owns Python-native, model-heavy capabilities that are
awkward or inefficient to run directly in the Go backend: OCR, layout analysis,
table structure, provider-specific document conversion, hybrid document
chunking, and later specialized inference workloads such as advanced audio,
enrichment, scraping, HuggingFace models, or training/evaluation loops.

It does not own product orchestration. `seshat-backend` remains responsible for
local user settings, agent tools, upload workflows, RAG ingestion orchestration,
fallback policy, and deciding whether a local reader or this external service
should run first. `seshat` remains the shared Go library surface: neutral
interfaces, local lightweight extraction, SDK tools, and RAG primitives.
`seshat-server` is the enterprise/multi-tenant control plane for organizations,
quotas, shared infrastructure, policy, and fleet-level operations.

The intended document-reading policy is:

- local Seshat readers are the default path;
- this service is used only when explicitly configured;
- if a caller opts into external priority, this service runs first and the local
  reader remains a fallback;
- otherwise the local reader runs first and this service is the fallback for
  OCR/layout/provider-heavy cases.

That boundary is deliberate. This service may internally use Docling, Marker,
DeepDoc/RAGFlow-style components, or future custom providers, but callers should
depend on it as "document intelligence", not on any specific provider name.

## documents

Conversion runs through a `DocumentProvider` (`providers/base.py`), a small
Protocol so the underlying library is swappable per deployment rather than
hardcoded. Two real implementations exist today:

- `providers/docling.py` - wraps Docling as an internal Python library
  (`from docling.document_converter import DocumentConverter`), not as a
  separate HTTP server - that's the difference from the `docling-serve`
  setup `seshat-backend` uses today (see `seshat/internal/python/docling.go`).
  `docling-serve` stays available and unaffected in the meantime; this is a
  separate, new service `seshat-backend` isn't calling yet. Broad format
  support (PDF, Office, Markdown, HTML, images, ...). Default provider.
- `providers/marker.py` - wraps Marker (`marker.converters.pdf.PdfConverter`).
  PDF-only, different layout-detection behavior (e.g. classifies headings
  into structured metadata rather than always inlining them in markdown).

Which one runs is a single process-wide choice (`document_provider` in
`config.py`, `SESHAT_INTELLIGENCE_DOCUMENT_PROVIDER` env var) - no
per-request routing yet.

Current slice:

- `POST /v1/documents` - upload a file, convert it with the configured
  provider, get back the extracted markdown.
- `GET /v1/documents/{id}` - re-fetch a previously converted document.
- `DELETE /v1/documents/{id}`
- `POST /v1/documents/chunks` - upload a file, get back Docling's
  document-aware hybrid chunks (see "Document-aware chunking" below).
- `GET /health`

Every conversion keeps the full result on disk under `storage_dir`
(`~/.config/seshat/intelligence/documents` by default), not just the
markdown: the original file, the provider's full raw structured result as
JSON, and metadata. See `documents/store.py`'s own doc comment for why -
re-chunking or re-embedding later shouldn't require re-running OCR/layout
analysis.

Not built yet, on purpose: embeddings, reprocessing, a real pipeline
selection (`standard` / `scanned_pdf` / ...).

### Document-aware chunking

`POST /v1/documents/chunks` runs Docling's own `HybridChunker`
(`providers/chunker/docling.py`) as a library call - the same document-aware
chunking `docling-serve` exposes over HTTP at `/v1/chunk/hybrid/file`, which
seshat's Go RAG pipeline (`internal/rag.DoclingChunker`, in the `seshat`
repo) currently calls out to. The response shape mirrors that Go side's
`internal/docling.Chunk` field-for-field (`index`, `text`, `raw_text`,
`num_tokens`, `headings`, `captions`, `page_numbers`, `doc_items`) on
purpose, so wiring seshat's Go client at this endpoint instead of
docling-serve is a base-URL change there, not a data-model change - not done
yet, deliberately (see "What this service is (and isn't)" below).

Always uses Docling regardless of `document_provider` - Marker has no
equivalent structural chunker, and this endpoint isn't the one
`document_provider` governs.

This endpoint is stateless - it returns chunks, nothing is persisted.
Chunk caching/storage stays seshat's Go RAG pipeline's job
(`internal/rag/chunk_cache.go`), not this service's.

## connectors

The worker side of the Knowledge connectors, per
[docs/decisions/0001-go-python-boundary.md](../docs/decisions/0001-go-python-boundary.md). The service is
stateless: the caller (`seshat-server`) owns state, schedules, credentials and permission enforcement, and
sends everything a call needs.

- `GET /v1/connectors` - registered kinds, what each can do (`sync`, `slim`, `permissions`, `identities`,
  `preview`, `webhook`, `filters`) and its `permission_model`.
- `POST /v1/connectors/{kind}/validate` - check credentials and configuration.
- `POST /v1/connectors/{kind}/sync` - `application/x-ndjson` stream: `document`, `deleted`, `failure`
  events, then one final `checkpoint`.
- `POST /v1/connectors/{kind}/slim` - ids and ACLs without content, to detect deletions.
- `POST /v1/connectors/{kind}/permissions` - confirmed ACLs for given ids; ids it could not confirm are
  omitted, never reported as unrestricted.
- `POST /v1/connectors/{kind}/identities` - users and groups with their members, so the server can resolve
  `group:` access entries. A group whose members could not be listed is reported as a failure, never emitted
  as an empty group (empty would mean nobody).
- `POST /v1/connectors/{kind}/preview` - where to open the original of one resource.
- `POST /v1/connectors/{kind}/webhook` - verify a push notification and say whether the server should sync.
- `POST /v1/connectors/{kind}/filters` - the folders, drives or spaces a source can be scoped to.

`permission_model` is `app` when reaching the source grants every record in it (the server can skip a
per-record check) or `record` when each record carries its own ACL. The default, for a connector that does
not say, is `record`, the safe one.

The OpenAPI schema is checked in as `openapi.json` and the Go client for `seshat-server` is generated from
it. Regenerate it with `python scripts/export_openapi.py`; a test fails when it is out of date. The NDJSON
endpoints are described as one `ConnectorEvent` per line.

The contract is in `connectors/models.py`. Access entries are prefixed identities (`user:`, `group:`,
`domain:`, `public`) and an unknown prefix is rejected. `access` absent means the source reports no ACL;
an empty list means nobody. A connector subclasses `Connector` and mixes in the capabilities it supports
(`connectors/base.py`), then registers in `ConnectorRegistry`. Errors raised mid-stream become a final
`failure` event, since the HTTP status is already sent.

### gdrive

Google Drive, read only (`connectors/gdrive`, over httpx, no Google SDK). A port of the Go connector in
`seshat/pkg/connectors/gdrive.go` that closes its known gaps:

- A file whose permissions cannot be read is **not emitted**, because emitting it with no ACL would open
  it to the whole corpus. It is reported as a `permissions` failure and carried in the checkpoint
  (`retry_ids`) to be retried on the next call.
- Removed, trashed, or no longer allowed files are reported as `deleted` events; `slim` lists the ids
  currently visible so the server can reconcile.
- The checkpoint is typed (`phase`, `list_token`, `changes_token`, `retry_ids`, `more`). A bootstrap is
  split across calls by `page_budget` pages, and the change feed token is captured before listing so
  changes made during the listing are not lost.
- A rate limit ends the stream with a `rate_limited` failure carrying `retry_after_seconds` and **no**
  checkpoint, so the caller keeps its previous one.
- A link-only share is not mapped to `public`.

Group permissions are emitted as `group:<email>`; `identities` lists the Google Workspace users, groups and
members (Admin SDK Directory API, needs an admin credential) so the server can resolve them. `filters` lists
shared drives and folders, and `preview` returns the `webViewLink`. Webhooks are in the contract but not
implemented for Drive yet.

Binary formats (PDF, Office) go through an extractor passed to `GDriveConnector(extractor=...)`. The app
wires `connectors/extraction.py`'s `router_extractor`, which uses the reading router described below. An
unreadable file is a non-retryable `parse` failure (`extraction_failed`) carrying the router's reason; a
crashing extractor is a retryable one (`extractor_error`) and the file is carried in `retry_ids`.

## reading

`POST /v1/documents/read` (multipart `file`, optional form field `pdf_mode`) reads a file into markdown by
the cheapest path that gives usable text, and reports how each page was read (`reading/`). The same router
backs the connectors. It follows the routing of the Go engine (`seshat/internal/documentreading` and
`pdfsmart`), which stays the default for local use; this is the cloud-side counterpart.

- **Office** (DOCX, PPTX, XLSX): read natively; an engine only when the text is thin or garbled. Zip bombs are
  refused and never offered to an engine.
- **PDF, page by page**: a page keeps its own text layer unless it carries a meaningful image (at least 10% of
  the page, so a repeated logo does not count), has fewer than 20 characters, or has garbled text (`(cid:N)`
  placeholders, or more than 5% private-use characters). Only those pages go to an engine, consecutive ones in
  a single call so a table spanning pages stays whole. PDFium runs in a worker process under a deadline.
- **Safety contract**: the result is `ok` only if every page that needed text got some. Otherwise the pages are
  discarded and the whole document goes to the engines, and if that fails too the result is not `ok`. A
  partial document that silently misses a page is the failure this is built to avoid.
- **Engines**: Docling for every format, Marker for PDFs only and optional (`pip install
  "seshat-intelligence[marker]"`, because its model weights are free only for research, personal use and small
  companies). `pdf_provider_policy` is `auto` (Docling first, Marker as a second opinion when an answer is
  empty or garbled), `docling` or `marker`. No per-document-type rule is built in until there is a measurement
  behind it.
- **Reading modes** (`reading_mode` setting, or a per-request `mode` field):
  `custom` (default) is everything above. `docling` sends every file that is not plain text straight to Docling,
  with no native routing. `marker` sends PDFs straight to Marker and reads every other format with the custom
  native reader above, with no engine behind it, because Marker reads only PDFs: a format that needs an engine
  (an image, HTML, a thin Office file) is reported instead of being read. `marker` needs the extra and
  `ENABLED_PROVIDERS` to list it; a mode whose engine is not available answers `ok: false` with that reason.
- **`pdf_mode="whole"`** (setting or per request) sends every PDF to the engines. Borderless tables and vector
  charts are invisible to the page routing, so use it where missing one is not acceptable (invoices,
  financial reports).

Settings: `SESHAT_INTELLIGENCE_READING_MODE`, `..._ENABLED_PROVIDERS`, `..._PDF_PROVIDER_POLICY`, `..._PDF_MODE`,
`..._MIN_CHARS_PER_PAGE`, `..._MIN_IMAGE_AREA_RATIO`.

## What this service is (and isn't)

seshat already has a mature RAG pipeline in Go (`internal/rag/`,
`internal/vector/`): chunk profiles/caching, an embedding-provider
abstraction (Ollama/OpenAI/Google/Mistral), three working vector store
backends (OpenSearch, pgvector, SQLite+HNSW), hybrid BM25+vector retrieval
with reranking, all wired into the SDK and the `search_knowledge` agent
tool. None of that is being rebuilt here - that would just be duplication.

This service's job is narrow and deliberate: own the two capabilities that
are genuinely Python-native and that Go has no reasonable equivalent for -
document conversion (`providers/docling.py`, `providers/marker.py`) and
Docling's hybrid chunking (`providers/chunker/docling.py`) - so they can run
in-process instead of behind a separate `docling-serve` HTTP dependency.
Embeddings, indexing, retrieval, and all RAG orchestration stay in Go.

## Concurrency

Both `POST /v1/documents` and `POST /v1/documents/chunks` still answer
synchronously (no job-id/polling API), but the actual work runs off the
request-handling process, on two separate fixed pools of worker processes:
`documents/conversion_pool.py` (`conversion_max_workers` in `config.py`,
`SESHAT_INTELLIGENCE_CONVERSION_MAX_WORKERS`, default 2) and
`documents/chunking_pool.py` (`chunking_max_workers`,
`SESHAT_INTELLIGENCE_CHUNKING_MAX_WORKERS`, default 2). Separate pools on
purpose - chunking always loads Docling's own models regardless of
`document_provider`, so sharing one pool between both jobs would mean every
worker keeps both providers' models resident for no reason.

Two reasons this isn't just a threadpool call:

- The event loop stays free. Other routes (`/health`, `GET`/`DELETE` on
  other documents) keep responding immediately while a conversion or
  chunking job is in flight - confirmed live: uploading a 20-page PDF (~70s
  including a cold-start OCR model download) never slowed `/health` past a
  few ms.
- Concurrency is bounded on purpose. Each in-flight job holds a full
  model's worth of memory; `max_workers` is a hard ceiling so load doesn't
  turn into an OOM. Requests beyond that queue on the executor's own call
  queue instead of piling up unbounded.

Each worker loads its models once, the first time that worker picks up
work, and reuses them for every job it handles after that - not per
request.

A process manager that supervises this service should send it a graceful
shutdown signal (not a hard kill) so the FastAPI lifespan hook can call
both pools' `shutdown()` and let in-flight worker processes wind down
cleanly, rather than leaving them orphaned.

## Structure

```
src/seshat_intelligence/
  api/            shared FastAPI app wiring - mounts each domain's router
  config.py       runtime settings (SESHAT_INTELLIGENCE_* env vars)
  providers/      shared, cross-domain document-intelligence capabilities
    base.py         the DocumentProvider Protocol + ConvertedDocument,
                     for conversion
    docling.py       conversion - DoclingProvider
    marker.py         conversion - MarkerProvider
    chunker/        one folder per capability that has its own family of
                     implementations, same shape as providers/ itself
      base.py          shared ChunkResult/ChunkingFailed
      docling.py        DoclingHybridChunker (the only implementation so
                         far - Marker has no equivalent, so no Protocol
                         here yet either)
  documents/      Document Intelligence - routes, schemas, services
                  (ConvertDocument, ChunkDocument), on-disk storage,
                  and the two worker pools (conversion_pool.py,
                  chunking_pool.py) that run providers/ off the event loop
```

A new capability domain (`retrieval`, `evaluation`, ...) gets its own
top-level package next to `documents/`, following the same shape (routes /
schemas / service), mounted in `api/app.py`. A new conversion provider gets
its own module next to `docling.py` in `providers/`; a new chunker
implementation gets its own module next to `docling.py` in
`providers/chunker/`.

## Preparing the models

Docling needs models, and nothing should be downloaded in the middle of a request. `scripts/prepare_models.py`
lists what a profile needs, downloads what is missing, and checks offline that it all loads:

```bash
uv run python scripts/prepare_models.py                       # the plan: hardware, profile, what is there, what is missing
uv run python scripts/prepare_models.py --download --verify   # fetch what is missing, then convert a tiny PDF offline
uv run python scripts/prepare_models.py --profile full --device cuda --artifacts-path /models/docling --download --verify
```

Nothing is downloaded without `--download`. The profile (`SESHAT_INTELLIGENCE_DOCLING_PROFILE`):

| Profile | Models | Size | Adds |
|---|---|---|---|
| `minimal` (default) | layout, TableFormer | 522 MB | what Docling does by default |
| `standard` | + picture classifier | 556 MB | accurate table mode, picture labels |
| `full` | + CodeFormulaV2 | 1196 MB | formulas as LaTeX, code with its line breaks |

`--profile auto` picks one from the hardware: `full` on a CUDA card with 6 GB or more, `standard` otherwise,
`minimal` below 8 GB of memory. OCR (RapidOCR) ships inside the Python package; `--ocr easyocr --ocr-languages fr en`
adds EasyOCR's models. By default models go to Docling's own cache; `--artifacts-path DIR` puts them in a directory
for a server image, and the service then needs `SESHAT_INTELLIGENCE_DOCLING_ARTIFACTS_PATH` set to it.
`SESHAT_INTELLIGENCE_DOCLING_OFFLINE=true` makes the service refuse to download at run time.

The service reads PDFs with pdfium (`SESHAT_INTELLIGENCE_DOCLING_PDF_BACKEND`, default `pypdfium`). Docling's own PDF
reader splits words at kerning gaps and breaks accented letters on some fonts. What Docling returns is then cleaned of
defects that come from PDF encoding (an accent left apart from its letter, ligature glyphs, soft hyphens); see
`providers/hygiene.py`. Keep `docling-parse` below 7.22 if you switch back to its reader: 7.22 changes characters and splits words.

## Running it

```bash
uv sync
uv run main.py
```

Starts on `127.0.0.1:5100` by default (override with
`SESHAT_INTELLIGENCE_HOST` / `SESHAT_INTELLIGENCE_PORT` /
`SESHAT_INTELLIGENCE_STORAGE_DIR`).

```bash
curl http://127.0.0.1:5100/health

curl -F "file=@/path/to/some.pdf" http://127.0.0.1:5100/v1/documents

curl -F "file=@/path/to/some.pdf" http://127.0.0.1:5100/v1/documents/chunks
```

## Tests

```bash
uv run pytest
```
