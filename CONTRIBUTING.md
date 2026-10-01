# Contributing to SeshatOS

SeshatOS is the self-hosted local product built on the Seshat Go runtime: a
single-user/small-team AI desktop app with a local REST API, document
intelligence, knowledge/RAG, and agent workspaces. This repository is where
the application backend, desktop experience, and local document-intelligence
service are developed.

See [LICENSE](./LICENSE) for the terms this code is released under.

---

## Contribution areas

- **Backend API** — REST endpoints, SSE streaming, app wiring, service boundaries, and API contracts for clients and SDKs.
- **Desktop app** — Electron, React UI flows, workspace ergonomics, settings, and local productivity surfaces.
- **Knowledge and document intelligence** — RAG pipelines, document ingestion, OCR/layout analysis, and app-level memory features.
- **Docs and onboarding** — developer docs, deployment guides, API usage examples, and contribution clarity.

---

## Branching strategy

```
main        production-ready, tagged releases only
  └── dev   stable integration — all work lands here first via PR
        └── <type>/<slug>   one branch per issue
```

- Always branch off `dev`.
- Never commit or push directly to `main`.
- Never commit or push directly to `dev`.
- All work must land through a PR: `<type>/*` → `dev`, then `dev` → `main`.
- PRs target `dev`. The only allowed PR into `main` is `dev` → `main` for final validation by maintainers.
- Direct PRs from topic branches into `main` must be closed without merge.
- The **Gate CI check** (Build + Test + Lint) must be green before any PR can merge.
- Name branches `<type>/<short-slug>` where `<type>` is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, or `ci`.

---

## Before you open a PR

- **Bug fix** — confirm the bug is reproducible; include a failing test case in the PR if possible.
- **New feature** — open an issue to discuss scope before writing code.
- **Refactor** — discuss first. We are conservative about structural changes.
- **Documentation** — PRs are welcome without prior discussion.

---

## Desktop surface activation order

`seshat-desktop` is being rebuilt chat-first, one surface at a time, on React + TypeScript + Tailwind. Only the `ACTIVE` surface takes feature work; `LOCKED` surfaces are frozen until their turn.

| Surface | Status | Notes |
|---|---|---|
| Chat | ACTIVE | |
| Settings | LOCKED | |
| Admin Panel | LOCKED | Connected-mode only — appears only when this install is linked to the commercial cloud product; not part of standalone local use |
| Scheduling | LOCKED | Connected-mode only, same as above |
| Skills Creator | LOCKED | |
| Knowledge UI | LOCKED | |
| Automation, Inbox, Companion, Team | POST_MVP | |

Exceptions to the LOCKED rule: a shared-component migration the active surface genuinely needs, a bug fix blocking the active surface, or a security/correctness fix explicitly approved in the PR discussion. Do not otherwise touch a LOCKED or POST_MVP surface.

A LOCKED surface can only move to ACTIVE once the surface ahead of it is actually done — fully migrated to Tailwind, no leftover mixed styling, loading/empty/error states handled, typecheck/lint/build/tests passing — not just "looks right visually."

---

## Development setup

### Requirements

- Go 1.26+
- Node.js 22+ (for the desktop build)
- `golangci-lint` for linting
- SQLite3 (for local dev; PostgreSQL is optional)

### Clone and build

```bash
git clone <this-repo>
cd seshatos

# Build the local backend API server
cd seshat-backend && go build -o bin/seshat-api ./cmd/api
cd ..

# Run tests
go test ./seshat-backend/...
go test -race ./seshat-backend/...
```

### Environment

```bash
cp .env.example .env
export SESHAT_ADMIN_EMAIL=admin@example.com
export SESHAT_ADMIN_PASSWORD=changeme
export ANTHROPIC_API_KEY=sk-ant-...   # or any supported provider key
```

Then run:

```bash
./seshat-backend/bin/seshat-api
# Server on http://localhost:8090
```

See [`docs/development.md`](./docs/development.md) for the full variable reference.

---

## Code conventions

### Adding a new domain

Every feature domain follows the same three-layer pattern:

```
seshat-backend/internal/<domain>/          ← business logic (no HTTP, no DB layer)
seshat-backend/internal/api/<domain>.go    ← HTTP handlers (thin, delegates to service)
seshat-backend/internal/db/<domain>.go     ← data access (store + models)
```

Wire the new service in `seshat-backend/internal/app.go` (`Dependencies` + `App` + `NewApp`), add the store initialization in `seshat-backend/internal/api/bootstrap.go`, and register routes in `seshat-backend/internal/api/routes.go`.

Full walkthrough in [AGENTS.md](./AGENTS.md#adding-a-new-backend-domain).

### Error handling

Use `bkerr` in services. Handlers call `writeBackendError` — HTTP status mapping is automatic.

```go
// Service
return nil, bkerr.NotFound("thing not found", err)

// Handler
if err != nil { writeBackendError(w, err); return }
```

### Go style

- Format with `gofmt` — enforced by CI.
- Follow `go vet` — enforced by CI.
- No `interface{}` — use `any`.
- `context.Context` as first parameter on any function that may do I/O.
- Pointer receivers on types that contain `sync.Mutex`.

### seshat dependency

`seshat` is consumed as an external Go module (`github.com/KPO-Tech/seshat`), not vendored in this repo. Never patch it via `replace` directives here. If you need something from the engine that isn't yet in `pkg/`, open a PR on the [seshat repo](https://github.com/KPO-Tech/seshat) first, then bump the version with `go get github.com/KPO-Tech/seshat@vX.Y.Z` in `seshat-backend/go.mod`.

---

## Commit messages

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

Examples:
```
feat(memories): add long-term extraction opt-out per user
fix(auth): invalidate sessions on password change
docs(api): document SSE framing contract in query_sse.go
```

---

## Testing

- Run `go test -race ./seshat-backend/...` before submitting.
- Tests must not make real API calls to external providers.
- New services should have at least one test.
- Table-driven tests preferred for cases with multiple inputs.

---

## Pull request checklist

Before pushing, run locally:

```bash
go build ./seshat-backend/...
go test -race ./seshat-backend/...
gofmt -w .
go vet ./seshat-backend/...
```

PR checklist:

- [ ] Tests pass (`go test -race ./seshat-backend/...`)
- [ ] New behavior is covered by at least one test
- [ ] Public API changes are reflected in `README.md` or `docs/`
- [ ] Commit messages follow Conventional Commits
- [ ] PR targets `dev`, not `main`
- [ ] No local `replace` directive added for `github.com/KPO-Tech/seshat`

---

## What we will not merge

- Features that push business logic into `internal/api/` handlers.
- Direct store access from handlers (always use a service).
- Local `replace` directives pointing `github.com/KPO-Tech/seshat` at a filesystem copy.
- Changes that remove or weaken authentication/authorization checks.
- Code that uses `//nolint` without an explanation comment.
- New global mutable state.
- Anything that would make this codebase depend on `seshat-server`'s private source.
