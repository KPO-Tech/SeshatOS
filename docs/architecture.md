# Architecture — SeshatOS

Decisions on what is Go and what is Python: [decisions/0001-go-python-boundary.md](decisions/0001-go-python-boundary.md).

This document describes the current repository layout and the package boundaries inside the local product backend, and between it and the open-source `seshat` runtime.

---

## Repository shape

```
seshatos/
├── seshat-backend/        ← local backend / desktop HTTP API
├── seshat-desktop/        ← Electron desktop client
└── shared/connector-catalog/  ← connector metadata consumed by the desktop app
```

`seshat` — the open-source Go runtime — is not part of this repository. It is consumed as an
external module, `github.com/KPO-Tech/seshat`, declared directly in `seshat-backend/go.mod`.

The dependency direction is intentionally one-way:

```text
seshat-desktop   → seshat-backend   (HTTP only)
seshat-backend   → seshat           (pkg/* only)
seshat           → seshat-backend   (never)
```

`seshat-backend` can optionally run in "connected mode" against Seshat's commercial cloud
offering (`seshat-server` — a separate, private repository, not part of this one) for
identity/settings/preferences delegation and shared catalogs (agents/MCP/skills). That
integration is entirely one-directional and HTTP-only, under `internal/cloud/`:
`seshat-server`'s own source is never a build dependency of this repository, and
`seshat-backend` works fully standalone ("standalone mode") with no cloud connection at all.

`go.work` at the repository root ties the local Go module together during local development:

```go
use (
    ./seshat-backend
)
```

---

## Local backend

```
seshat-backend/
├── cmd/api/                     ← thin HTTP entrypoint
└── internal/
    ├── api/                     ← transport layer, SSE, middleware, route wiring
    ├── app.go                   ← DI container
    ├── agents/                  ← agent definitions
    ├── audit/                   ← audit log service
    ├── auth/                    ← auth, sessions, API keys, RBAC
    ├── bkerr/                   ← typed backend errors
    ├── cloud/                   ← HTTP client glue for optional connected mode
    ├── db/                      ← stores, schema, migrations
    ├── documentreading/         ← local-first/external-fallback document conversion
    ├── files/                   ← file management
    ├── knowledge/               ← RAG ingestion and retrieval
    ├── mcp/                     ← MCP configuration
    ├── memories/                ← user memory services
    ├── metrics/                 ← observability snapshot service
    ├── plans/                   ← plans attached to sessions
    ├── preferences/             ← permission mode and user prefs
    ├── query/                   ← runtime adapter over seshat SDK
    ├── quotas/                  ← usage counters
    ├── settings/                ← providers, OAuth, storage config
    ├── skills/                  ← skill registry and resolution
    └── websearch/               ← web search providers and logs
```

### Layer order

```text
cmd/api
  → internal/api
  → internal/app.go
  → internal/<domain>
  → internal/db
  → seshat/pkg/*
```

### Responsibilities

`cmd/api/`
- Process startup and shutdown
- Config loading
- HTTP server boot

`internal/api/`
- Parse requests and validate inputs
- Resolve auth principals
- Call domain services
- Map `bkerr` to HTTP responses
- Stream SSE responses for agent runs

`internal/app.go`
- Compose stores, services, and runtime dependencies
- No business logic

`internal/<domain>/`
- Own business rules
- Accept principals and typed params
- Return domain types and `bkerr` errors
- Never import `internal/api/`

`internal/db/`
- Own persistence concerns only
- CRUD, queries, pagination, migrations
- No transport logic
- No high-level business policy

---

## Runtime boundary

The backend depends on the public `seshat/pkg/*` surface only.

Allowed examples:

```go
import (
    "github.com/KPO-Tech/seshat/pkg/config"
    "github.com/KPO-Tech/seshat/pkg/rag"
    "github.com/KPO-Tech/seshat/pkg/sdk"
    "github.com/KPO-Tech/seshat/pkg/storage"
    "github.com/KPO-Tech/seshat/pkg/types"
)
```

Forbidden:
- importing `seshat/internal/*`
- coupling the UI directly to Go packages or DB internals

---

## Request lifecycle in the local backend

```text
HTTP request
  → middleware
  → handler in internal/api
  → service in internal/<domain>
  → store in internal/db
  → response mapping / SSE stream
```

For query streaming:

```text
POST /api/v1/query/stream
  → auth middleware
  → query handler
  → query service
  → seshat SDK runtime
  → SSE chunks + runtime events
  → final response
```

---

## Development commands

From the repository root:

```bash
go build ./seshat-backend/...
go test ./seshat-backend/...
```

Run the local backend:

```bash
cd seshat-backend
go run ./cmd/api
```

Run the desktop app (backend + Electron UI):

```bash
make dev
```
