# 0011 - Faster and steadier indexing of Knowledge

Status: proposed, 2026-10-31. Builds on [0002](0002-chat-document-reading.md) for the readers.

## Context

Indexing a whole folder of collections fails for most documents ("Failed: ingest chunks: embedding API returned 429 ... You exceeded
your current quota"), and each document then has to be retried by hand. Extraction is also slow. What the code does today:

- **One worker, one document at a time.** `Runner.runTick` claims a job and processes it from end to end (read the file, chunk it,
  embed it, store it) before it claims the next. `MaxPerTick` only says how many jobs one wake-up runs in a row; they are never
  concurrent (`knowledge/runner.go`).
- **No wait on a quota refusal.** The embedder sends batches of 64 texts one after the other and, on any status other than 200,
  returns the error at once (`seshat-runtime/internal/rag/embedder/embedder.go`, `embedOpenAI`). Only a "too many tokens" refusal is
  handled (the batch is halved).
- **A retry too soon to help.** A failed job is queued again after 2 seconds, three attempts in all (`defaultIngestionRetryDelay`,
  `defaultIngestionMaxAttempts`), then it stays `Failed`. A per-minute quota is not back after 6 seconds, which is why a retry done by
  hand a little later works.
- **The reading engines do not all accept concurrent calls.** Indra works through one worker process behind a mutex
  (`documentreading/indra.go`); the native OCR serialises PDFium calls with a process-wide mutex (`nativedoc/pdfsync`) and pools its
  ONNX sessions; Docling is an HTTP service.
- **Claiming a job is already safe for several workers.** `ClaimNextDue` selects and updates inside a transaction, with the update
  conditioned on the status and the attempt count.

## Measurements (2026-10-31)

Done by reading, without changing anything, 60 files of `rag-testpack/enterprise-corpus/corpus` (a spread over the folders and types, files
up to 4 MB, 202 files in all), with the native Go readers and the production chunker profile (structured), on a Windows machine with
12 logical cores. No embedding call was made: the quota is not spent by the measurement, and the latency of a provider is not measured.

| Step | Result |
|---|---|
| Read, one file at a time | 81.7 s in all for 60 files |
| Chunk | 0.056 s in all for the same files (about 1 ms a file) |
| `.docx` (19 files, 3.7 MB) | 17 ms on average, 83 ms at most |
| `.md`, `.txt` | under 1 ms |
| `.pdf` (36 files, 33.8 MB) | 2.26 s on average, 11.7 s at most; 7 of the 36 yield no text (scans, which need OCR or Docling) |
| Chunks produced | 1 669: 61 embedding requests if sent document by document (27 passages each on average), 27 requests in full batches of 64 |
| Reading with 2, 4, 6 workers at once | 1.73x, 2.66x, 3.02x faster (48.6 s, 31.5 s, 27.8 s instead of 84.0 s) |

What it says:

- **Reading PDFs is the cost**: about 98% of the time. Chunking is free and `.docx` reading is fast.
- **Reading scales with cores**, with diminishing returns after about four workers.
- **Embedding requests are half empty**: documents are small, so a request carries 27 passages on average where 64 fit. Batching
  across documents would divide the number of requests by about 2.3.

Not measured, and to settle before the last lot: the time of the embedding calls themselves; which quota trips for the user's provider
(per minute or per day, in requests or in tokens; the body of the 429 says); the speed of Docling, Indra and the native OCR on scans.

## Decision (proposed)

Five lots, each in its own PR and each useful alone. The first two fix the failures and come first.

1. **Wait on a refusal for quota (seshat-runtime).** In the embedder, a 429 (and a 503 that asks to wait) is waited out instead of
   returned: the delay of `Retry-After` or of the provider's own field when there is one, otherwise 5 s, 15 s, 45 s with a little
   jitter, for three minutes at most, and always stoppable through the context. A refusal that says the quota is per day, or that
   keeps coming back after the three minutes, fails with a message that names it (wait for tomorrow or change the provider), not
   with the raw body. Unit tests against a fake server (a refusal then success, a persistent refusal, `Retry-After`, a cancelled
   context). Released as the next runtime patch.
2. **A job that waits is not a job that failed (SeshatOS).** An error of kind "rate limited" puts the job back to `Pending` with a delay
   of a minute and does not use one of its attempts; the file shows "Waiting for the embedding provider" instead of "Failed". The
   error line of a real failure keeps its full text on hover. The runtime bump comes with this lot.
3. **Several readers, one embedder (SeshatOS).** The runner becomes a pool of `N` workers, `N = clamp(cores / 2, 1, 4)`
   (`SESHAT_INGEST_WORKERS` overrides it). The embedding step goes through a shared gate of one at a time, so reading goes faster
   without multiplying the requests the provider sees. A worker that must use a serial engine (Indra, the native OCR, a Docling
   service set to one at a time) holds that engine's own gate, so those engines keep working exactly as today. A cap on the bytes
   being read at once (256 MB) keeps the memory in check. Tests: two workers never claim the same job, a failed job is left to its
   own worker, the gates hold, and the whole queue is drained.
4. **Say what is happening (SeshatOS desktop).** The collection page shows the count of documents read, waiting and failed, and the
   reason a document waits (quota), so that a long run is not read as a freeze.
5. **Fewer, fuller embedding requests (seshat-runtime, optional).** Group the passages of several documents in one request up to the
   batch size, and give each document its own result. Only if the measure of lot 1 and 2 shows the number of requests, not the
   tokens, is what trips the quota: it makes the failure of one document harder to attribute.

Also to look at, separately: the slowest PDFs (11.7 s for 1.9 MB and 77 passages). A profile of the PDF reader (page loop, image
detection) comes before any change.

## How it is checked

- Lots 1 and 2: the tests above, then a real run on a copy of the test corpus with the user's provider, counting the refusals and
  the documents that end `Failed`. The success criterion is zero `Failed` from a quota on the whole corpus, however long it takes.
- Lot 3: the same 60 files through the runner with 1, 2, 4 workers, comparing the total time with the measure above (2.66x expected
  with four), and a run of the whole corpus to compare the chunks stored with those of a sequential run (they must be identical).
- Nothing is run on the user's own collections: the measures use the copy of the test corpus.

## Consequences

- A long indexing is slower than a lucky one against a generous quota and never fails for the quota.
- A provider with a low plan is slow, not broken. The message says which limit it hit.
- More concurrent reading means more memory and heat while it runs; the number of workers and the byte cap are the two levers.

## Not decided here

- Whether the number of workers should be a setting in the app (an environment variable first).
- A rate limiter that anticipates the quota (a token bucket per provider) instead of reacting to the refusal.
