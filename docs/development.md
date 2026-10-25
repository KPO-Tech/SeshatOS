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

## One version of the app

There is one version of the app. The main branch, `make dev` and a build you make yourself show everything: accounts, SeshatCloud, Knowledge, the store and the sources of an answer. `make dev-next` was the name of the second version and now only runs `make dev`.

A release can still hide what is not ready. The release workflow builds the app with `VITE_SESHAT_EDITION=public` (three build steps in `.github/workflows/release-desktop.yml`), which switches the flags of `seshat-desktop/src/renderer/lib/edition.ts` off: the local, single-user workspace of the first public version. That value is what a release shows; change it, with the comment above it, to release with more or less. `npm run dev:public` (in `seshat-desktop`) runs the app the way such a release shows it. Nothing is removed by a flag: the hidden code stays compiled and typed.

## Starting as a brand new install

`make dev` and `make dev-native` start the app as if it had just been installed: the first-run wizard shows, there is no account, no session, no model, nothing the app remembered. They do it with an empty runtime root, `.cache/dev-fresh` in the project (git ignores `.cache/`), wiped at every start. Everything the app keeps sits under the runtime root, the backend database and the models as much as Electron's own storage, so one folder is enough. **Your own data (`~/.config/seshat`) is never read or touched in this mode.**

```bash
make dev                       # a brand new install (FRESH=1, the default)
make dev FRESH=0               # your own data, as before
make dev KEEP_MODELS=1         # a brand new install, but keep the models downloaded earlier: the wizard still shows and nothing is downloaded twice
make dev-native                # the same, with the backend built with the native OCR: the wizard then offers the scanned documents
```

The wizard offers the scanned documents only when the backend it can run was built with the native OCR. An unpackaged app has no bundled backend, so `make` points it to the one it built (`SESHAT_SETUP_BACKEND`); the plain `make dev` builds without the OCR, and the box then shows greyed out with the reason. `make dev-native` needs a C compiler (see `make install-cgo-windows`). It builds its own binary, `seshat-backend/bin/seshat-dev-native`, which is linked to pdfium and does not start unless the pdfium folder is on the path (the target sets it); `make dev` and `make dev-next` build and run `seshat-dev`, never the native one, and remove a `seshat-dev` that was built with the OCR (an older `make dev-native` wrote to that name).

## Start time of `make dev`

`make dev` builds the backend into `seshat-backend/bin/seshat-dev` (`.exe` on Windows) when a file of the backend changed, and runs that binary. It used to run `go run`, which links a new executable of about 100 MB at every start. A start with nothing changed does not build at all.

Measured on a Windows laptop with the project on a 5400 rpm hard disk (Go and Node caches on the same disk), from `make dev` to a usable chat:

| | Time |
|---|---|
| `go run`, every module loaded at start | 248 s |
| built binary, pages and modals loaded when first opened, Vite warm-up | 24 s (caches warm) |

What decides the rest, in order:

1. **Where the files are.** `node_modules` holds about 46,000 files (950 MB). A hard disk reads about 100 files a second at random; a `make dev` from a hard disk spends most of its time waiting for it, with the processor idle. Keep the repository, `node_modules` and the Go caches (`GOCACHE`, `GOTMPDIR`) on an SSD.
2. **The antivirus.** On Windows, real-time protection scans every new executable (the backend binary, `electron.exe`) and the files Vite reads. Excluding the repository, `node_modules` and the Go caches from the scan removes the waits that remain.
3. **Memory.** With under 1 GB free the system pages, and every start is slower.

The first start after `npm install` or a change of `electron.vite.config.ts` is slower: Vite optimizes its dependencies once. `optimizeDeps.include` lists a dependency its scan cannot see (the PDF worker), because finding it late made Vite reload the page.
