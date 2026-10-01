# Local Development

## Workspace Structure

`seshat-ai` uses a committed Go workspace at the repository root to connect two
local modules:

```text
seshat-ai/
  seshat-backend/   local backend and desktop API
  seshat-server/    cloud server
  seshat-ui/        Electron desktop UI
  go.work           connects backend and server
```

`go.work` contains:

```go
use (
    ./seshat-backend
    ./seshat-server
)
```

The `seshat` engine is not a submodule and should not be referenced through a
local `replace`. It is consumed as the published external module
`github.com/KPO-Tech/seshat`.

Both Go modules currently consume:

```go
require github.com/KPO-Tech/seshat v1.0.2
```

## Common Workflow

From the repository root:

```sh
go test ./seshat-backend/... ./seshat-server/...
```

Backend only:

```sh
cd seshat-backend
go build ./cmd/api
go test ./...
```

Server only:

```sh
cd seshat-server
go build ./cmd/server
go test ./...
```

## Updating The Seshat Engine

The `seshat` code lives in its own repository:
`github.com/KPO-Tech/seshat`.

To consume a new runtime change from `seshat-ai`:

1. Merge the runtime change in the `seshat` repo.
2. Publish a new semver tag, for example `v1.0.2`.
3. Run `go get github.com/KPO-Tech/seshat@vX.Y.Z` from both
   `seshat-backend/` and `seshat-server/`.
4. Commit the updated `go.mod` and `go.sum` files.

Do not commit local `replace` directives for `github.com/KPO-Tech/seshat`.
