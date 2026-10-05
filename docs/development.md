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
`github.com/KPO-Tech/seshat`.

The backend module consumes:

```go
require github.com/KPO-Tech/seshat v1.2.55
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
`github.com/KPO-Tech/seshat`.

To consume a new runtime change:

1. Merge the runtime change in the `seshat` repo.
2. Publish a new semver tag, for example `v1.2.56`.
3. Run `go get github.com/KPO-Tech/seshat@vX.Y.Z` from `seshat-backend/`.
4. Commit the updated `go.mod` and `go.sum` files.

Do not commit local `replace` directives for `github.com/KPO-Tech/seshat`.
