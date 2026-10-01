# Architecture — SeshatOS

This document describes the current repository layout and the package boundaries between the local product backend, the cloud control plane, and the open-source runtime.

---

## Repository shape

```
seshat-ai/
├── seshat-backend/   ← local backend / desktop HTTP API
├── seshat-server/    ← cloud control plane (IAM, orgs, automation, knowledge, ...)
└── seshat-ui/        ← Electron desktop client
```

`seshat` — the open-source Go runtime — is not part of this repository. It is consumed as an
external module, `github.com/KPO-Tech/seshat`, declared directly in `seshat-backend/go.mod`
and `seshat-server/go.mod`.

The dependency direction is intentionally one-way:

```text
seshat-ui        → seshat-backend   (HTTP only)
seshat-backend   → seshat           (pkg/* only)
seshat-server    → seshat           (pkg/* only)
seshat           → seshat-backend   (never)
seshat           → seshat-server    (never)
```

`seshat-server` does not import `seshat-backend` — confirmed 2026-08-10 (zero
occurrences of the module path in `seshat-server/go.mod` or any import). The
two product backends are independent Go modules that both depend on `seshat`,
not on each other; see "Cloud server bootstrap" below for why an earlier
version of this document described a temporary shared-package dependency
that no longer reflects the code.

`go.work` at the repository root ties the two local Go modules together during local development:

```go
use (
    ./seshat-backend
    ./seshat-server
)
```

---

## Local backend

The main product backend now lives in `seshat-backend/`.

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
    ├── db/                      ← stores, schema, migrations
    ├── files/                   ← file management
    ├── knowledge/               ← RAG ingestion and retrieval
    ├── mcp/                     ← MCP configuration
    ├── memories/                ← user memory services
    ├── metrics/                 ← observability snapshot service
    ├── plans/                   ← plans attached to sessions
    ├── preferences/             ← permission mode and user prefs
    ├── query/                   ← runtime adapter over seshat SDK
    ├── quotas/                  ← usage counters
    ├── resources/               ← users, orgs, workspaces
    ├── scheduler/               ← local scheduled runs
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
- Docling auto-start for local desktop usage

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

## Cloud server bootstrap

**This section was stale until 2026-08-10** — it previously described
`seshat-server` as an early bootstrap with only `api/`/`app/`/`config/` and a
"target role" still to be built. The code has moved well past that; see
`docs/archive/audit-2026-08-10.md` (local/cloud boundary section) for the audit that
caught the drift, and `ROADMAP.md` ("Direction: seshat-server becomes the
multi-tenant backbone") for the up-to-date migration status, which is the
document to check first when this section next goes stale.

`seshat-server/` is a real, independently mature control plane, not a
bootstrap:

```
seshat-server/
├── cmd/server/                  ← server entrypoint
└── internal/server/
    ├── api/                     ← HTTP handlers
    ├── app/                     ← server dependency container
    ├── config/                  ← bootstrap and wiring
    ├── iam/                     ← orgs, users, memberships, roles, policy bindings, audit (mature, heavily tested)
    ├── automation/               ← devices, scheduled jobs, runs (mature, heavily tested)
    ├── knowledge/                 ← org-scoped RAG/corpus domain, mirrors seshat-backend's knowledge
    ├── agentregistry/             ← shared agent preset catalog
    ├── mcpregistry/                ← shared MCP server catalog
    ├── skillregistry/              ← shared skill repo catalog
    ├── memories/                   ← flat memory list (connected-mode counterpart to local memories)
    ├── longtermmemory/              ← graph memory (connected-mode counterpart to local long-term store)
    ├── preferences/                 ← connected-mode user preferences
    ├── quotas/                      ← usage counters (counting only, no enforcement)
    ├── websearchsettings/            ← org/platform web search provider config
    ├── workspacechat/                ← console's own live chat playground (sdk.Session directly, not job-based)
    ├── mailer/                       ← SMTP sender (self-service registration emails)
    └── apperr/                       ← typed server errors
```

Current role — already built, not aspirational:
- Full cloud IAM: organizations, memberships, invitations, groups, dynamic
  custom roles, policy bindings, audit trail, superadmin
- Automation: device pairing, scheduled jobs, runs, single-instance scheduler
- Org-scoped knowledge/RAG, hybrid BYOK/platform-default provider and
  embedder settings
- Shared catalogs (agents/MCP/skills) that `seshat-backend`'s `cloud*`
  adapters consume read-only, enrichment-only, in connected mode
- Self-service registration by email domain

Known-thin areas (built and wired, but with minimal test coverage — see the
LOC/test-file breakdown in `docs/archive/audit-2026-08-10.md`): `websearchsettings`,
`mcpregistry`, `agentregistry`, `preferences`, `skillregistry`,
`longtermmemory`, `quotas` (each has real handlers but only one test file);
`workspacechat` has no dedicated test file at all despite reusing
`sdk.Client`/`sdk.Session` directly.

Explicitly deferred, not started: **interactive sessions** (multi-turn,
streamed, persistent chat through `seshat-server` itself, as opposed to
one-shot scheduled jobs) — see ROADMAP.md for why this is scoped separately
rather than an extension of `automation`.

The important rule is still architectural, not just physical: `seshat-server`
must not become a second copy of the local runtime backend. It should own
cloud coordination concerns. In practice this holds today — e.g. inbox
thread/message bodies stay exclusively in `seshat-backend` (see "Example:
Inbox" below), and `seshat-server` never stores them.

### Example: Inbox

The inbox connectors (Gmail, WhatsApp) are a concrete instance of this split.

`seshat-backend` owns all of it today: the `Connector` interface, `inbox.Service`,
the connector implementations, encrypted account tokens, threads/messages, the
agent tools, and the Inbox Agent. This runs per local install regardless of mode.

`seshat-server` owns nothing here yet. Two extensions are anticipated once a real
multi-user/multi-device organization needs them, not before:

- Org-level OAuth app credentials (an admin registers one Google Workspace client
  for the whole org), mirroring the SSO `provider_config.go` pattern already used
  for OIDC/SAML.
- Multi-tenant sync orchestration through `cloudautomation`, replacing the
  local-only ticker (`runGmailSyncLoop`) that exists solely because
  `cloudautomation` is connected-mode-only.

`seshat-server` must never store thread or message bodies itself — that would be
the "second copy of the local runtime backend" the rule above forbids.

### Example: Knowledge connectors

Knowledge connectors (S3 today; Google Drive/SharePoint planned) made the
**opposite** choice from Inbox above, deliberately: `seshat-server` executes
Discover/Sync fully itself — all in `internal/server/connectors` —
with no device involved at all, not even for orchestration.

That package holds the account/job orchestration (`service.go`, `worker.go`,
`runner.go`) *and* one file per connector implementation (`s3.go` today,
`gdrive.go`/`sharepoint.go` planned) — deliberately not split into a separate
package per connector, or a generic top-level `connector` interface package:
nothing outside this domain ever needs to construct or type-switch on a
connector directly, so the extra package boundaries bought isolation nothing
else used. The shared contract (`knowledgeConnector` interface,
`syncAccount`/`syncSecret`/`resourceRef`/`syncItem` shapes) lives in
`types.go`, unexported — a connector implementation only needs to satisfy the
interface, not import it from elsewhere.

Why the split is different here: Inbox connectors hold *live, growing,
per-device state* (thread/message bodies accumulating indefinitely on one
user's machine) that the rule above exists to keep out of the control plane.
A Knowledge connector sync is the opposite shape — a read-only pull of
point-in-time document content that becomes a `CorpusFile`, i.e. exactly the
kind of organization-scoped record `knowledge` already owns and stores
server-side for a manual upload. Running Discover/Sync in `seshat-server`
doesn't duplicate a local backend's job; it's the same `knowledge.Service`
ingestion pipeline (`UploadFile` and `IngestFromConnector` both end at
`enqueueIngestionJob`) fed from a second source. This is also what makes an
org's knowledge base usable with **no desktop app running anywhere** — the
goal driving this domain, distinct from Inbox's still-open "org-level OAuth
app + orchestration only" plan above.

`seshat-backend`'s `internal/connector`/`internal/knowledge/s3` packages are the
blueprint, ported and adapted (not imported — see the runtime-boundary rule
below) to be organization-scoped: `syncAccount`/`syncSecret` carry an
`OrganizationID`/`CorpusID` instead of a `UserID`, and secrets are encrypted
under the organization's own DEK (`sdb.EncryptSecret`, the same envelope
encryption `Provider.ClientSecret` already uses) rather than
`seshat-backend`'s flat AES-GCM. A `ConnectorSyncRunner` (same
poll-and-backoff `Runner` shape as `knowledge.Runner`) reaps due accounts into
`ConnectorSyncJob` rows and processes them, so periodic auto-sync needs no
separate cron.

Google Drive/SharePoint (built) reuse `iam.Provider`'s OAuth pattern
directly: `ConnectorOAuthApp` (org-scoped `ClientID`/encrypted
`ClientSecret`, one per `(OrganizationID, Kind)`) and `ConnectorOAuthState`
(DB-persisted single-use state+PKCE, shaped like `OIDCLoginState`), a fixed
server-owned callback URL (`{PublicAPIURL}/api/v1/connectors/{kind}/oauth/
callback`) — a better fit than seshat-backend's shared-global-client +
in-memory-state pattern, which assumes one desktop user and one shared app
registration. Unlike seshat-backend's native/desktop OAuth client type
(loopback redirect, no real client secret for Microsoft), both providers
here register as confidential "Web application" clients, since the callback
is always this server's own fixed public URL — PKCE is layered on top of
both anyway, uniformly, matching `iam`'s own OIDC flow instead of
special-casing Microsoft's public-client requirement.

`gdrive.go`/`sharepoint.go`/`sharepoint_graph.go` in
`internal/server/connectors` are the ported Discover/Sync logic (unchanged
from `seshat-backend`'s `knowledge/gdrive`/`knowledge/sharepoint`); `oauth.go`
in the same package owns the app-registration + connect-flow service
methods (`RegisterOAuthApp`, `BeginConnectorOAuth`, `CompleteConnectorOAuth`).
`connectorFor` is org-aware (`(ctx, kind, organizationID)`) so it can resolve
the right org's OAuth app when building a gdrive/sharepoint connector for a
sync job — s3 ignores the organization ID entirely, since its credentials
are already embedded in the account itself.

---

## Runtime boundary

Both product backends depend on the public `seshat/pkg/*` surface only.

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
- pushing product auth or org logic into `seshat`
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
go build ./seshat-backend/... ./seshat-server/...
go test ./seshat-backend/... ./seshat-server/...
```

Run the local backend:

```bash
cd seshat-backend
go run ./cmd/api
```

Run the cloud server bootstrap:

```bash
cd ../seshat-server
go run ./cmd/server
```
