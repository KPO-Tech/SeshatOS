# 0001 - Where Go ends and Python begins

Status: accepted, 2026-10-02. Revisit when a second Python service is proposed.

## Context

The Seshat family grew with its pieces in the wrong places and a growing number of capabilities
(document parsing, connectors, inference) that are easy in Python and slow to get right in Go.
This record fixes the split so new work lands in the right place.

## Decision

Two long-running services, in two languages:

| Service | Language | Role |
|---|---|---|
| `seshat-server` (SeshatCloud) | Go | Control plane |
| `seshat-intelligence` (SeshatOS) | Python | One monolithic service for everything that lives off Python's library ecosystem |

`seshat-backend` is the local desktop backend and stays Go. It is a sidecar, not a third service.

### Go owns

- Identity, organisations, permissions, and their enforcement at query time.
- State and scheduling: corpora, sources, sync jobs, checkpoints, credentials (encrypted at rest).
- Search orchestration, audit, quotas, the public API.
- The agent runtime and the tools it ships (`seshat/`), and anything bundled into the desktop binary.

### Python owns

- Knowledge connectors: reading, syncing, listing ids for reconciliation, and extracting access
  entries. Replaces the Go connectors progressively; a Go connector is retired only once its Python
  replacement passes the same parity tests.
- Document parsing, OCR, layout, chunking.
- Embeddings, reranking and any other model inference, evaluation jobs.
- Media and voice capabilities as they are built: image generation, audio (speech to text, text to speech), call center services. Real-time voice may still need its own process role, or its own service, because a long-lived streaming workload behaves differently from batch work; that is the case where the two-service rule gets revisited.
- Tools that are easier in Python. They are exposed to the agent through MCP, which `seshat` already
  speaks, so no new protocol is needed.

### The contract between them

- Python workers are stateless. Go owns the state.
- A worker call carries a connector, a checkpoint and a credential reference, and returns a stream of
  documents (sections, metadata, access entries), the ids seen, per-item failures, and the next
  checkpoint.
- Wire format: JSON over HTTP (NDJSON for streams) described by OpenAPI, with a generated Go client.
  No message broker until a concrete need appears.
- Agent action connectors (send a mail, create a ticket) are a different category from knowledge
  connectors and stay out of this move.

## Consequences

- One Python codebase, but it can run in several process roles (api, document workers, connector
  workers) from the same image so they scale independently.
- Two toolchains to build, test and ship; the OpenAPI schema is what prevents type drift.
- `seshat-intelligence` stays in SeshatOS, so desktop and cloud both consume the same service and its
  source stays public.

## Where other things live

- `seshat/` keeps `seshattui` (the open-source entry point meant to attract contributors) and the
  tools, which SeshatOS and SeshatCloud import.
- Product-shaped code that landed in `seshat/` for reuse (for example `pkg/connectors`) moves out as
  the Python connectors replace it, not before.
