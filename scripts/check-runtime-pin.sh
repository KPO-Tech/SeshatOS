#!/usr/bin/env bash
#
# Fails when the pinned seshat-runtime is older than its latest published release.
#
# seshat-runtime is released from its own repository, so a release lands with no
# commit here and a pin that goes stale is invisible from this side: v1.5.0 was
# still required here when v1.8.0 was out, and nothing noticed. Dependabot watches
# the other Go modules of this repository and has never proposed this one, so this
# check is what keeps the pin from drifting.
#
# "The latest release" is what the module proxy resolves for @latest, that is the
# version `go get` would install. The comparison is left to `go list -u`, which
# reports a newer version only when one exists, so a pin ahead of the latest
# release (a pseudo-version under test) is not reported as drift.
#
# usage: bash scripts/check-runtime-pin.sh <module-directory>
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
module_dir=${1:?usage: bash scripts/check-runtime-pin.sh <module-directory>}
cd "$module_dir"

module=github.com/KPO-Tech/seshat-runtime

if ! pin=$(go list -m -f '{{.Version}}' "$module"); then
  echo "::error::cannot read the $module requirement of $module_dir/go.mod"
  exit 1
fi

if ! release=$(go list -m -u -f '{{with .Update}}{{.Version}}{{end}}' "$module"); then
  echo "::error::cannot check $module for a newer release"
  exit 1
fi

if [ -n "$release" ]; then
  echo "::error::$module is pinned to $pin, but $release is released"
  echo "Bump it with: cd $module_dir && go get $module@$release && go mod tidy"
  exit 1
fi

echo "$module is pinned to $pin, its latest release"
