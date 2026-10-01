# Desktop Packaging and Startup

This document describes the current desktop startup path and the packaging
contract for Windows and Linux builds.

## Startup Model

`seshat-ui` is an Electron app. In development it expects a backend already
running at `http://127.0.0.1:8090`, unless `SESHAT_BACKEND_ORIGIN` is set.

In packaged builds, `src/main/backend-process.ts` starts a bundled backend
sidecar from:

```text
<resourcesPath>/backend/seshat-backend[.exe]
```

The backend prints `SESHAT_BACKEND_READY port=<port>` on stdout. Electron reads
that line and pins the renderer proxy to the actual local port.

The renderer never talks to `seshat-server` directly. It talks to the local
backend through the Electron main-process HTTP proxy. The main process performs
an HMAC handshake against `/api/v1/desktop/handshake` before proxying requests.

## Connected Mode Is Not Configurable

The desktop app remains local-first by default, and there is no supported way
to point a packaged build at a different `seshat-server` deployment via
environment variable, build flag, or Settings field. The backend sidecar
decides connected vs. standalone mode itself at boot, by probing a single URL
compiled into the Go binary (`defaultServerURL` in
`seshat-backend/internal/config/bootstrap.go`) — this is deliberate:
`seshat-server` access is Seshat's paid managed-service tier, and a
configurable target would let anyone redirect the app to a free self-hosted
instance instead. If that URL isn't reachable within a couple seconds, the
backend starts in standalone mode.

Earlier drafts of this document described a `SESHAT_DEFAULT_SERVER_URL` /
`SESHAT_SERVER_URL` forwarding mechanism between Electron and the sidecar.
That mechanism has been removed — the Go binary never read `SESHAT_SERVER_URL`
as an environment variable, so it did nothing.

## Windows Build

Run from `seshat-ui/` on Windows:

```powershell
npm run package:win
```

This builds:

- `resources/backend/seshat-backend.exe`
- Electron renderer/main bundles
- an NSIS installer under `dist/`

The sidecar build forces `GOOS=windows`, `GOARCH=amd64`, and `CGO_ENABLED=0`.
Local Windows builds are unsigned by default (`signAndEditExecutable=false`) so
they do not require code-signing certificates or symlink privileges. CI release
builds can re-enable signing once a certificate is available.

Because the default bundled backend is built with `CGO_ENABLED=0`, optional
native document OCR (`nativedoc`, built behind `cgo && nativedoc`) is not
available in the default packaged desktop sidecar. DeepDoc model files can
still be downloaded and detected, but local native OCR only becomes runnable
from a backend built with CGO and the `nativedoc` build tag, or from a future
external intelligence service.

For a nativedoc-enabled Windows package, run:

```powershell
npm run package:win:nativedoc
# or from the repo root:
make desktop-package-win-native
```

This uses `scripts/setup-nativedoc-cgo.sh` to fetch pdfium/pdf_oxide/
onnxruntime, compiles the sidecar with `CGO_ENABLED=1 -tags nativedoc`, and
copies `pdfium.dll` and `onnxruntime.dll` next to the backend executable. The
machine doing the build still needs a working Windows C compiler on `PATH`
(MSYS2 MinGW-w64 GCC is the tested route). The installer should not silently
install compiler toolchains on end-user machines; release CI should build and
ship the native sidecar and its runtime DLLs instead.

The packaged app stores runtime data under the configured Seshat runtime root,
defaulting to the user's home config directory.

## Linux Build

Run from `seshat-ui/` on Linux:

```sh
npm run package:linux
```

This builds:

- `resources/backend/seshat-backend`
- Electron renderer/main bundles
- AppImage and `.deb` artifacts under `dist/`

The default sidecar build forces `GOOS=linux`, `GOARCH=amd64`, and
`CGO_ENABLED=0`. That has the same consequence as Windows: optional `nativedoc`
OCR is not compiled into the packaged desktop backend by default.

For a nativedoc-enabled Linux package, run:

```sh
npm run package:linux:nativedoc
# or from the repo root:
make desktop-package-linux-native
```

This compiles the sidecar with CGO, copies `libpdfium.so` into the backend
resource directory, and the Electron sidecar launcher prepends that directory
to `LD_LIBRARY_PATH` before spawning the backend.

For Linux packaging, build on Linux or in a Linux CI/container. Windows cannot
reliably produce native `.deb`/AppImage artifacts without the Linux packaging
toolchain.

## Release Pipeline Shape

A future CI release should run a matrix:

- Windows: checkout, install Node, install Go, `npm ci`, `npm run package:win`
- Linux: checkout, install Node, install Go, `npm ci`, `npm run package:linux`

There is no release-time server URL to inject (see "Connected Mode Is Not
Configurable" above) — every build targets whatever `defaultServerURL` is
compiled into `seshat-backend/internal/config/bootstrap.go` at that commit.
