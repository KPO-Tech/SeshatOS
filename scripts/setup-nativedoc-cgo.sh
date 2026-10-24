#!/usr/bin/env bash
# Delegates nativedoc's native dependency setup to the pinned seshat runtime.
# The runtime owns the exact pdfium/pdf_oxide/onnxruntime versions and platform
# flags; seshat-ai only needs a stable entrypoint for Make/npm packaging.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

runtime_script=""
if [ -f "$repo_root/../seshat/scripts/setup-nativedoc-cgo.sh" ]; then
  runtime_script="$repo_root/../seshat/scripts/setup-nativedoc-cgo.sh"
else
  # go list reports no directory for a module that is not in the cache yet, which is the case on a clean machine (CI).
  (cd "$repo_root/seshat-backend" && go mod download github.com/KPO-Tech/seshat-runtime) >&2
  runtime_dir="$(cd "$repo_root/seshat-backend" && go list -m -f '{{.Dir}}' github.com/KPO-Tech/seshat-runtime)"
  # On Windows go reports a C:\ path; bash wants the POSIX form.
  if command -v cygpath >/dev/null 2>&1; then
    runtime_dir="$(cygpath -u "$runtime_dir")"
  fi
  runtime_script="$runtime_dir/scripts/setup-nativedoc-cgo.sh"
fi

if [ ! -f "$runtime_script" ]; then
  echo "# ERROR: nativedoc setup script not found in the local or module-cache seshat runtime." >&2
  exit 1
fi

bash "$runtime_script"
status=$?
if [ "$status" -ne 0 ]; then
  if [ "${OS:-}" = "Windows_NT" ]; then
    echo "# Tip: run scripts/install-windows-cgo.ps1, open a new terminal, then retry make dev-native." >&2
  fi
  exit "$status"
fi
