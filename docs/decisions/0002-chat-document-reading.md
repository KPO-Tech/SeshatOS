# 0002 - Chat gives the agent the file, not a conversion

Status: accepted, 2026-10-02. Step 1 (inventory) is below; steps 2 to 4 are not started.

## Context

When a file is attached in chat, the backend saves it in the session workspace and converts it to
markdown in the background (`files.convertSessionFileAsync`), writing `<name>.md` and
`<name>.document.json` next to it. The prompt then lists the file with its path, the markdown path and
a `document_reader_status`, and tells the agent to use `read_file`, which serves the sidecar.

That keeps the agent from seeing a PDF as a PDF, makes the user wait for the conversion before sending
(the composer blocks while a document is `processing`), and pays a whole-document conversion whether or
not the agent needs it.

Chat reading and Knowledge are different jobs. Chat reads on demand: light, local, scoped to the pages
the agent asks for. Knowledge indexes: it needs structure (headings, tables, pages) and so a structured
reader such as Docling. The Go reader's role is the first, not the second.

## Decision

The agent gets the original file and reads it on demand with its Read tool:

1. For a local file, keep the path and record size, mtime and hash; warn the agent when the file changed
   since it was attached. Keep a copy only when there is no path (paste, drag from a browser). In the
   cloud the same tool reads a stored copy by id.
2. The Read tool becomes document aware: a map of the document on first read (page count, headings, pages
   with no text, pages with images), page ranges that are honoured, bounded output, the whole text when the
   document is short, a cache per file, and a clear message for a page that needs its image or an engine.
3. Nothing is converted at import. The composer no longer waits.
4. The import-time conversion path is removed once nothing uses it.

## Inventory (step 1)

What exists today, from reading the code.

### Backend (`seshat-backend`)

| Where | What it does | Fate |
|---|---|---|
| `internal/files/service.go` `convertSessionFileAsync` | converts on upload, writes `.md`, `.document.json`, extracted images, saves the result in the store | removed (step 4) |
| `internal/files/service.go` `ReadMarkdown`, `cachedReadResultMarkdown`, `enrichDocumentReadMetadata`, `visualPagesFromReadResult` | serve the sidecar and its metadata | removed |
| `internal/files/types.go` `MarkdownPath`, `DocumentRead*` fields | expose conversion state to the API and prompt | removed |
| `internal/query/context.go` `buildAttachmentContext`, `isConvertibleDocumentCandidate` | prompt block with `markdown_path` and `document_reader_status` | rewritten: path, size, pages, no conversion status |
| `internal/api/document_reader.go`, `system.go`, `config/bootstrap.go` | the document reader setting and diagnostics (Docling or intelligence URL, native OCR) | stays: the reader is still used on demand and by local Knowledge |
| `internal/knowledge/service.go`, `config/bootstrap.go` (hybrid chunker) | local Knowledge ingestion | out of scope, uses the reader for indexing |
| `internal/documentreading/` (`processor.go`, `cache.go`, `capabilities.go`, `nativedoc*.go`, `external.go`, `policy.go`, `chunker.go`) | the processor behind upload conversion, policy between native OCR and external reader | processor and cache removed with step 4; policy and native OCR stay for the Read tool and Knowledge |

### Desktop (`seshat-desktop`)

| Where | What it does | Fate |
|---|---|---|
| `components/chat/composer/useDraftAttachments.ts`, `pages/Home.tsx` | poll `document_read_status` and block sending while `processing` | polling and the block removed |
| `components/chat/attachments/attachmentTypes.ts`, `AttachmentThumb.tsx` | the `processing`, `failed` states and their thumbnail | simplified |

### SDK (`seshat`)

| Where | What it does | Finding |
|---|---|---|
| `internal/tools/files/read/fileread.go` `readPDFFile` | serves the `.md` sidecar if it is fresh (24 h), else native text via `internal/pdftext`, else the configured reader, else the PDF as base64 | **the `pages` parameter is ignored on the sidecar, native and reader paths**; only the base64 fallback uses it, so the agent cannot read a page range of text |
| same, `readDocumentReaderFile` | DOCX, PPTX, XLSX, audio through the sidecar or the reader | same: whole document each time |
| `internal/pdftext` | the Read tool's own PDF text extraction | a third reader beside `pdfsmart` and `nativedoc` |
| `pkg/documentreading` + `internal/pdfsmart` | page by page native-first reading (v1.2.57) | per-page text exists here but the Read tool does not use it |
| `internal/tools/files/documentreader`: `convert_document`, `render_document_page`, `read_document_url` | convert on request, render a page to an image, read a URL | `render_document_page` already covers viewing a page |

## Consequences

- One reader for chat: `pkg/documentreading` and its per-page results replace `internal/pdftext` in the Read tool.
- The Read tool change is in the SDK, so it ships as a new `seshat` tag.
- A scanned page with a model that has no vision needs the engine fallback; the tool must say so rather
  than return nothing.
- The path reference only exists on a machine that has the file. The cloud gets a copy and an id.
- The backend setting for the document reader stays; only the import-time use goes.
