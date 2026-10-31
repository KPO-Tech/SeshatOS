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

**End to end (2026-10-31).** The same 60 files through the real pipeline (jobs, reading, chunking, storing, with an embedder that costs nothing and counts its calls) took 77 s and 85 s in two runs, against 82 s for the reading alone: reading is the time, and the rest of the pipeline (queue, chunking, storing, bookkeeping) costs a few seconds in all. 53 files were indexed and 7 scanned PDFs ended `Failed` as unreadable; trying them again costs about a second in all, because a scan has no text to read, so it is not worth changing. The measure leaves out the network: each document sends `ceil(passages / 64)` embedding requests, one after the other, so the time of a sequential run is the time of reading plus the time of those requests, and a pool of readers with one embedder in front of it hides the requests behind the reading. The latency of the user's provider therefore sets how much is gained, not whether to do it.

Not measured, and to settle before the last lot: the time of the embedding calls themselves; which quota trips for the user's provider
(per minute or per day, in requests or in tokens; the body of the 429 says); the speed of Docling, Indra and the native OCR on scans.

## Decision (proposed)

The first cause turned out to be the user's plan with the provider: after a change of provider the same collections indexed without a
failure. The queue itself works. What stays is making a refusal for quota harmless for anyone on a limited plan, showing what the
queue does, and the speed of reading. Lots, in the order they are done, each in its own PR and each useful alone:

1. **Order and find documents (SeshatOS).** Documents added by hand get the priority of format that the documents of a folder
   source already have (text, then Word, then PDF, then the rest, small files first). The collection page gets a sort menu (format,
   which is the order of processing and the default, name A to Z and Z to A, state with the failures first; the size is not offered, the page does not know it), a filter by
   format and by state, and a "Retry all failed" button, so that a run of failures is not retried one document at a time.
2. **Wait on a refusal for quota (seshat-runtime).** In the embedder, a 429 (and a 503 that asks to wait) is waited out instead of
   returned: the delay of `Retry-After` or of the provider's own field when there is one, otherwise 5 s, 15 s, 45 s with a little
   jitter, for three minutes at most, and always stoppable through the context. A refusal that says the quota is per day, or that
   keeps coming back after the three minutes, fails with a message that names it (wait for tomorrow or change the provider), not
   with the raw body. Unit tests against a fake server (a refusal then success, a persistent refusal, `Retry-After`, a cancelled
   context). Released as the next runtime patch.
3. **A refusal for quota is not a failed document, and the queue pauses (SeshatOS).** An error of kind "rate limited" puts the job
   back to `Pending` and does not use one of its attempts. A daily quota is not a pause: it is lot 6. The runner then pauses the whole queue for the others instead of starting the next
   document only to see it refused too, and resumes by itself when the wait is over. The collection page says so ("Paused: the
   embedding provider's quota, back in 40 s"); the document that is being read is the only one shown as "Indexing", the others wait
   in a quiet grey, and "Failed" is kept for a document that cannot be read or stored. The error line of a real failure keeps its full
   text on hover. The runtime bump comes with this lot.
4. **Several readers, one embedder (SeshatOS).** The runner becomes a pool of `N` workers,
   `N = clamp(cores / 2, 1, 4)` (`SESHAT_INGEST_WORKERS` overrides it). The embedding step goes through a shared gate of one at a
   time. A worker that must use a serial engine (Indra, the native OCR, a Docling service set to one at a time) holds that engine's
   own gate, so those engines keep working exactly as today. A cap on the bytes being read at once (256 MB) keeps the memory in
   check. The end-to-end measure above is the reason: reading is almost all of the time, and the gate hides the embedding requests behind it. Tests: two workers never claim the same job, the gates hold, and the queue is drained.
   Built 2026-10-31 and measured on the same 60 files through the real runner: 1 worker 76.4 s, 2 workers 50.3 s (1.52x), 4 workers 33.7 s (2.27x), 6 workers 30.3 s (2.52x), with the same 53 documents indexed and the same passages stored each time, and never more than one embedding request at once. The step that chunks and embeds stays one at a time, which is why the gain is a little under that of reading alone (2.66x with four).
5. **Dropped: fewer, fuller embedding requests.** Grouping the passages of several documents in one request only mattered if the number
   of requests tripped the quota. With a provider that does not refuse, it is complexity without a gain, and it makes the failure of
   one document harder to attribute.

6. **Search by keywords while the embedding does not work (seshat-runtime, then SeshatOS), proposed by the user.** A failed embedding does not mean that the reading failed, and until now it ended the document as `Failed`. When the embedding of a document fails for a reason that waiting does not mend (a wrong key, a model that is gone, a daily quota, a refusal that outlasts the wait of lot 2), the document is kept and indexed for keywords only, as the runtime already does when no embedder is set: the passages are stored without vectors and found by BM25. The collection page shows it next to the state, "Indexed, keywords only" against "Indexed" for a document with its vectors, and a notice pinned at the top of the page says that the embedding failed, why, and that a model with more quota will index them again. A refusal that waiting mends (lot 3) stays a pause and not this. What it takes:
   - the runtime: an ingest option that stores the passages without vectors (`IngestRequest.WithoutVectors`), so that the host does not have to call the embedder at all for that document;
   - SeshatOS: on an embedding error that is not a pause, ingest again with that option and mark the corpus file as keywords only (a new column on `corpus_files`, the only schema change of the plan);
   - the page: the "keywords only" mark, the pinned notice with the count of documents concerned, and a "Index again with the model" button;
   - the way back: the re-embedding that already exists (`knowledge/reembed.go`, which makes the vectors that are missing) is run for these documents when the model is changed or the button is pressed, and clears the mark;
   - search: a corpus where some passages have vectors and some do not is searched by both ways and the results are merged, which the hybrid search already allows; the page says so, because the quality of the answers differs between the two kinds of document.

Lot 6 is built (2026-10-31). Two decisions came with it: a refusal for a daily quota goes to the keywords-only way and not to a pause of an hour, since waiting does not mend it; and the reason of the fallback is kept in one column of `corpus_files` (`keywords_reason`, empty when the document has its vectors) from which the page reads the mark and the notice. A failure that is not the embedder's (a scan with no text, a file that cannot be read) is still a `Failed` document.

Also to look at, separately: the slowest PDFs (11.7 s for 1.9 MB and 77 passages). A profile of the PDF reader (page loop, image
detection) comes before any change.

## How it is checked

- Lots 2 and 3: the tests above, then a real run on a copy of the test corpus with the user's provider, counting the refusals and
  the documents that end `Failed`. The success criterion is zero `Failed` from a quota on the whole corpus, however long it takes.
- Lot 4: the same 60 files through the runner with 1, 2, 4 workers, comparing the total time with the measure above (2.66x expected
  with four), and a run of the whole corpus to compare the chunks stored with those of a sequential run (they must be identical).
- Nothing is run on the user's own collections: the measures use the copy of the test corpus.

## Consequences

- A long indexing is slower than a lucky one against a generous quota and never fails for the quota.
- A provider with a low plan is slow, not broken. The message says which limit it hit.
- More concurrent reading means more memory and heat while it runs; the number of workers and the byte cap are the two levers.

## Not decided here

- Whether the number of workers should be a setting in the app (an environment variable first).
- A rate limiter that anticipates the quota (a token bucket per provider) instead of reacting to the refusal.
