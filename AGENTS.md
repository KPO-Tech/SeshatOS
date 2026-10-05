# Agent Instructions — SeshatOS

Read this file before changing code in this repository.

---

## Project overview

SeshatOS is the self-hosted local product built on top of [seshat](https://github.com/KPO-Tech/seshat), the open-source Go agent runtime.

| Directory | Language | Role |
|---|---|---|
| `seshat-backend/` | Go | local backend / desktop HTTP API |
| `seshat-desktop/` | TypeScript / Electron | the desktop client, see its own `AGENTS.md` |
| `shared/connector-catalog/` | TypeScript | connector metadata consumed by the desktop app |

`seshat` — the open-source runtime — is not vendored here. It's an external Go module,
`github.com/KPO-Tech/seshat`, required directly in `seshat-backend/go.mod`. Never add a
local `replace` directive for it; bump the version with
`go get github.com/KPO-Tech/seshat@vX.Y.Z` instead.

Dependency direction is one-way:

```text
seshat-desktop  → seshat-backend   (HTTP only)
seshat-backend  → seshat           (pkg/* only)
seshat          → seshat-backend   (never)
```

`seshat-backend` may import `seshat/pkg/*` freely. It must never import `seshat/internal/*`.

`seshat-backend` can optionally run in "connected mode" against Seshat's commercial
cloud offering (`seshat-server`, a separate private repository — not part of this one)
for identity/settings/preferences delegation. That integration lives entirely behind
HTTP calls in `internal/cloud/`; `seshat-server`'s own source is never a dependency of
this repository.

---

## Build and test

Always run these before finishing Go work:

```bash
go build ./seshat-backend/...
go vet ./seshat-backend/...
go test -race ./seshat-backend/...
gofmt -w .
```

If a Go test fails, fix the root cause. Do not paper over failures with skips.

---

## Backend layout

```text
seshat-backend/
  cmd/api/                 thin local-backend entrypoint
  internal/api/            HTTP transport, SSE, middleware, route wiring
  internal/app.go          DI container
  internal/<domain>/       business logic
  internal/cloud/          HTTP client glue for optional connected mode
  internal/db/             persistence and migrations
```

---

## Package boundary rules

- `internal/api/` is transport only. No business logic there.
- `internal/<domain>/` owns business rules.
- `internal/db/` owns CRUD, queries, migrations, and persistence details.
- `internal/app.go` wires dependencies only.
- Services return domain types and `bkerr` errors.
- Handlers map those errors with `writeBackendError`.

Import direction is strict:

```text
internal/api → internal/<domain> → internal/db
internal/api → internal/app.go
```

Never import `internal/api/` from a service.

---

## Adding a new backend domain

Follow this pattern:

1. Add `seshat-backend/internal/<domain>/types.go` and `service.go`.
2. Wire the store and service in `seshat-backend/internal/app.go`.
3. Initialize persistence in `seshat-backend/internal/api/bootstrap.go`.
4. Add handlers in `seshat-backend/internal/api/<domain>.go`.
5. Register routes in `seshat-backend/internal/api/routes.go`.

Handlers stay thin. Stores are never called directly from handlers.

---

## Rules for seshat-desktop

`seshat-desktop` is a pure UI consumer of the local backend HTTP API.

Before changing UI code, read [`seshat-desktop/AGENTS.md`](./seshat-desktop/AGENTS.md).

Do not:
- move backend logic into Electron or React
- read backend internals directly from the UI
- hard-code policy that belongs in the backend

---

## Rules for seshat

- `seshat` is not part of this repository. It's an external Go module, `github.com/KPO-Tech/seshat`, developed in its own repo and pinned by version in `seshat-backend/go.mod`.
- Never add a local `replace` directive for it. If the backend needs something missing from `seshat/pkg/*`, add it in the seshat repo first, tag a release, then bump the version here with `go get github.com/KPO-Tech/seshat@vX.Y.Z`.

---

## Development commands

Run the local backend:

```bash
cd seshat-backend
go run ./cmd/api
```

Run the desktop app (backend + Electron UI) from the repository root:

```bash
make dev
```

---

## Documentation to update

When behavior changes, update the relevant docs:

- `README.md` for repo layout and quick-start changes
- `docs/architecture.md` for package or boundary changes
- `docs/development.md` for workspace and command changes
- `docs/RUNTIME.md` for runtime/docling behavior

---

## When in doubt

Read these first:

- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `seshat-backend/internal/app.go`
- `seshat-desktop/AGENTS.md`
