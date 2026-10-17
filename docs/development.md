# Local Development

## Workspace Structure

`seshatos` uses a committed Go workspace at the repository root:

```text
seshatos/
  seshat-backend/        local backend and desktop API
  seshat-desktop/        Electron desktop UI
  go.work                connects the Go module(s)
```

`go.work` contains:

```go
use (
    ./seshat-backend
)
```

The `seshat` engine is not a submodule and should not be referenced through a
local `replace`. It is consumed as the published external module
`github.com/KPO-Tech/seshat-runtime`.

The backend module consumes:

```go
require github.com/KPO-Tech/seshat-runtime v1.2.55
```

## Common Workflow

From the repository root:

```sh
go test ./seshat-backend/...
```

Backend only:

```sh
cd seshat-backend
go build ./cmd/api
go test ./...
```

Desktop only:

```sh
cd seshat-desktop
npm ci
npm run dev
```

## Updating The Seshat Engine

The `seshat` code lives in its own repository:
`github.com/KPO-Tech/seshat-runtime`.

To consume a new runtime change:

1. Merge the runtime change in the `seshat` repo.
2. Publish a new semver tag, for example `v1.2.56`.
3. Run `go get github.com/KPO-Tech/seshat-runtime@vX.Y.Z` from `seshat-backend/`.
4. Commit the updated `go.mod` and `go.sum` files.

Do not commit local `replace` directives for `github.com/KPO-Tech/seshat-runtime`.

## Local API exposure

The backend is meant for the desktop app on the same machine, so it is closed to everything else:

- It listens on `127.0.0.1` only. `SESHAT_API_HOST` changes the address.
- It refuses any request whose `Host` header is not `localhost`, a loopback address, the non-loopback `SESHAT_API_HOST` or a name in `SESHAT_API_ALLOWED_HOSTS` (comma-separated). This stops DNS rebinding, where a web page re-resolves its own domain to `127.0.0.1` to reach the API from the user's browser.
- `POST /auth/local-session` (the "continue without an account" session, which needs no secret) requires the header `X-Seshat-Desktop-Proof`: the HMAC-SHA256 of `auth/local-session` under the desktop bridge secret file. The Electron main process sends it. In a plain browser during development the renderer cannot read that file: start the backend with `SESHAT_ALLOW_UNPROVEN_LOCAL_SESSION=true` (never for a packaged app).
- The terminal websocket accepts a request without `Origin` (Electron's main process) or one whose `Origin` is the backend's own host.
