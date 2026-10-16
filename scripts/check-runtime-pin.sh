#!/usr/bin/env bash
#
# Fails when a Go module of this repository pins seshat-runtime behind its latest
# published release.
#
# seshat-runtime is released from its own repository, so a release lands with no
# commit here and a pin that goes stale is invisible from this side: v1.5.0 was
# still required here when v1.8.0 was out, and nothing noticed. Dependabot watches
# the other Go modules of this repository and has never proposed this one, so this
# check is what keeps the pin from drifting.
#
# The modules to check are taken from the checkout itself rather than named here,
# so a module added later is covered without touching this script. Naming a single
# path is what let one of them go unguarded.
#
# "The latest release" is what the module proxy resolves for @latest, that is the
# version `go get` would install. The comparison is left to `go list -u`, which
# reports a newer version only when one exists, so a pin ahead of the latest
# release (a pseudo-version under test) is not reported as drift. Module mode is
# forced, because a module outside go.work would otherwise be resolved through the
# workspace and could report a pin that is not the one being checked.
#
# usage: bash scripts/check-runtime-pin.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

module=github.com/KPO-Tech/seshat-runtime

mapfile -t dirs < <(
  git ls-files | grep -E '(^|/)go\.mod$' | while read -r file; do
    grep -q "$module" "$file" && dirname "$file"
  done
)

if [ ${#dirs[@]} -eq 0 ]; then
  echo "::error::no module of this repository requires $module"
  exit 1
fi

failed=0
for dir in "${dirs[@]}"; do
  if ! pin=$(cd "$dir" && GOWORK=off go list -m -f '{{.Version}}' "$module"); then
    echo "::error::$dir: cannot read the $module requirement"
    failed=1
    continue
  fi

  if ! release=$(cd "$dir" && GOWORK=off go list -m -u -f '{{with .Update}}{{.Version}}{{end}}' "$module"); then
    echo "::error::$dir: cannot check $module for a newer release"
    failed=1
    continue
  fi

  if [ -n "$release" ]; then
    echo "::error::$dir pins $module to $pin, but $release is released"
    echo "Bump it with: cd $dir && go get $module@$release && go mod tidy"
    failed=1
  else
    echo "$dir pins $module to $pin, its latest release"
  fi
done

exit "$failed"
