#!/usr/bin/env bash
# seshat-ui/scripts/install-python-env.sh
# Bootstrap the SeshatOS Python environment (docling-serve) for the desktop app.
#
# This is identical in behaviour to seshat/scripts/install-python-env.sh
# but uses the correct runtime root (~/.config/seshat, not the legacy seshat-cli path).
#
# What it does:
#   1. Install uv (Rust-based Python manager) if not already on PATH.
#   2. Create a venv at $SESHAT_RUNTIME_ROOT/.venv using Python 3.11+.
#   3. Install docling-serve into that venv for document conversion.
#
# Environment variables (all optional):
#   SESHAT_RUNTIME_ROOT   Config/data root (default: ~/.config/seshat)
#   DOCLING_EXTRAS       pip extras, e.g. "gpu" → installs docling-serve[gpu]
#   PYTHON_VERSION       Python version for the venv (default: 3.11)
#
# After running:
#   ./scripts/start-docling.sh        — start manually
#   make dev (from seshat-ui/)         — backend auto-starts docling on launch

set -euo pipefail

# ── Resolve runtime root ───────────────────────────────────────────────────────
_default_runtime_root() {
    local os
    os="$(uname -s 2>/dev/null || echo Linux)"
    if [ -n "${XDG_CONFIG_HOME:-}" ]; then
        echo "$XDG_CONFIG_HOME/seshat"
    elif [ "$os" = "Darwin" ] || [ "$os" = "Linux" ]; then
        echo "$HOME/.config/seshat"
    else
        echo "$HOME/.config/seshat"
    fi
}

SESHAT_RUNTIME_ROOT="${SESHAT_RUNTIME_ROOT:-$(_default_runtime_root)}"
VENV_DIR="$SESHAT_RUNTIME_ROOT/.venv"
PYTHON_VERSION="${PYTHON_VERSION:-3.11}"
DOCLING_EXTRAS="${DOCLING_EXTRAS:-}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

info()    { echo -e "${BLUE}[seshat-ui]${NC} $*"; }
success() { echo -e "${GREEN}[seshat-ui]${NC} $*"; }
warn()    { echo -e "${YELLOW}[seshat-ui]${NC} $*"; }
error()   { echo -e "${RED}[seshat-ui]${NC} $*" >&2; }

# ── 1. Install uv if missing ───────────────────────────────────────────────────
if command -v uv &>/dev/null; then
    success "uv already installed: $(uv --version)"
else
    info "uv not found — installing via official installer..."

    if command -v curl &>/dev/null; then
        curl -LsSf https://astral.sh/uv/install.sh | sh
    elif command -v wget &>/dev/null; then
        wget -qO- https://astral.sh/uv/install.sh | sh
    else
        error "Neither curl nor wget found. Install uv manually: https://astral.sh/uv"
        exit 1
    fi

    export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

    if ! command -v uv &>/dev/null; then
        error "uv installation succeeded but not found on PATH."
        error "Add \$HOME/.local/bin to your PATH then re-run this script."
        exit 1
    fi
    success "uv installed: $(uv --version)"
fi

# ── 2. Create runtime root ────────────────────────────────────────────────────
mkdir -p "$SESHAT_RUNTIME_ROOT"
info "Runtime root: $SESHAT_RUNTIME_ROOT"

# ── 3. Create the venv ────────────────────────────────────────────────────────
if [ -d "$VENV_DIR" ]; then
    info "Python venv already exists at $VENV_DIR"
else
    info "Creating Python $PYTHON_VERSION venv at $VENV_DIR ..."
    uv venv "$VENV_DIR" --python "$PYTHON_VERSION" --seed
    success "Venv created."
fi

# `uv venv` always produces a Windows-layout venv (Scripts\python.exe) when
# uv.exe itself is the native Windows binary - true even when this script
# runs under Git Bash, where `uname`-based OS checks don't reliably catch
# it. Probe the venv's own layout instead of guessing from the OS.
if [ -f "$VENV_DIR/Scripts/python.exe" ]; then
    PY_BIN="$VENV_DIR/Scripts/python.exe"
    DOCLING_BIN="$VENV_DIR/Scripts/docling-serve.exe"
else
    PY_BIN="$VENV_DIR/bin/python"
    DOCLING_BIN="$VENV_DIR/bin/docling-serve"
fi

# ── 4. Install docling-serve ──────────────────────────────────────────────────
# Pinned >=1.28.0: 1.27.0's policy.py crashes at import time
# (AttributeError: 'types.UnionType' object has no attribute 'model_fields')
# because _source_kinds() can't handle BatchSourceRequestItem's nested
# discriminated union. Fixed upstream in 1.28.0.
PACKAGE="docling-serve>=1.28.0"
if [ -n "$DOCLING_EXTRAS" ]; then
    PACKAGE="docling-serve[$DOCLING_EXTRAS]>=1.28.0"
fi

info "Installing $PACKAGE into $VENV_DIR ..."
uv pip install --python "$PY_BIN" "$PACKAGE"
success "docling-serve installed."

# ── 5. Verify ─────────────────────────────────────────────────────────────────
if [ ! -f "$DOCLING_BIN" ]; then
    error "docling-serve binary not found at $DOCLING_BIN after installation."
    exit 1
fi

# ── 6. Windows console-encoding fix ───────────────────────────────────────────
# docling-serve's startup banner (rich/uvicorn) prints an emoji. On Windows,
# DoclingManager redirects the subprocess's stdout/stderr to a log file, and
# GetConsoleMode always fails on a redirected-to-file handle - so rich falls
# back to a legacy byte-mode console writer that can't encode most Unicode,
# crashing docling-serve before it ever binds its port. A sitecustomize.py
# dropped into the venv's site-packages (the standard interpreter-startup
# hook) forces rich to report a modern, VT-capable console and reconfigures
# stdout/stderr to UTF-8, both before docling-serve's own code runs.
# Same venv-layout probe as above: a Scripts/ dir means Windows.
if [ -f "$VENV_DIR/Scripts/python.exe" ]; then
    SITE_PACKAGES="$VENV_DIR/Lib/site-packages"
    if [ -d "$SITE_PACKAGES" ]; then
        info "Windows detected — installing console-encoding fix into venv..."
        cat > "$SITE_PACKAGES/sitecustomize.py" <<'PYEOF'
"""Seshat-managed venv startup hook.

Fixes a Windows-only crash where docling-serve's startup banner (built on
rich/uvicorn) dies with a UnicodeEncodeError while writing an emoji, whenever
stdout/stderr are redirected to a file rather than a real console (see
seshat/internal/python DoclingManager.Start, which redirects docling-serve's
output to a log file):

1. rich decides whether a stream is a "legacy Windows console" by querying
   GetConsoleMode on it - which always fails for a redirected file, so rich
   falls back to a legacy byte-mode console writer that can't encode most
   Unicode. Patched here to report modern (VT-capable) console features.
2. Even off that legacy path, Python's own stdout/stderr TextIOWrapper still
   defaults to the OS ANSI codepage (cp1252) for a non-console stream, which
   still can't encode the emoji. Reconfigured here to UTF-8.
"""
import sys

if sys.platform == "win32":
    try:
        import rich.console
        from rich._windows import WindowsConsoleFeatures

        _features = WindowsConsoleFeatures(vt=True, truecolor=True)
        rich.console.get_windows_console_features = lambda: _features
    except ImportError:
        pass

    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            try:
                _stream.reconfigure(encoding="utf-8")
            except Exception:
                pass
PYEOF
        success "Console-encoding fix installed."
    else
        warn "Windows detected but $SITE_PACKAGES not found — skipping console-encoding fix."
    fi
fi

success "Installation complete."
echo ""
echo "  Runtime root: $SESHAT_RUNTIME_ROOT"
echo "  Venv:         $VENV_DIR"
echo "  Binary:       $DOCLING_BIN"
echo ""
echo "  Start docling-serve manually:"
echo "    ./scripts/start-docling.sh"
echo ""
echo "  Or start the full desktop app:"
echo "    make dev  (from the repo root)"
echo ""
