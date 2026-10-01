#!/usr/bin/env bash
# scripts/setup.sh
# One-command setup for SeshatOS app on Linux and macOS.
#
# What it does:
#   1. Verifies Go 1.26+ (seshat-backend)
#   2. Installs ripgrep (required at runtime by the engine's glob/grep tools)
#   3. Verifies Node.js 22+ and bun (or npm)
#   4. Installs Node dependencies (bun install)
#   5. Installs uv and docling-serve (optional — skip with SKIP_PYTHON=1)
#   6. Builds seshat-backend and the Electron app
#
# Usage:
#   ./scripts/setup.sh
#   SKIP_PYTHON=1 ./scripts/setup.sh     # skip docling setup
#   DOCLING_EXTRAS=gpu ./scripts/setup.sh
#
# Environment variables:
#   SESHAT_RUNTIME_ROOT   Override data dir (default: ~/.config/seshat)
#   DOCLING_EXTRAS       pip extras for docling-serve (e.g. "gpu")
#   PYTHON_VERSION       Python version for the venv (default: 3.11)
#   SKIP_PYTHON          Set to 1 to skip the Python/docling setup step

set -euo pipefail

OS="$(uname -s)"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_DIR="$REPO_ROOT/seshat-desktop"
BACKEND_DIR="$REPO_ROOT/seshat-backend"

if [ -z "${SESHAT_RUNTIME_ROOT:-}" ]; then
    if [ -n "${XDG_CONFIG_HOME:-}" ]; then
        SESHAT_RUNTIME_ROOT="$XDG_CONFIG_HOME/seshat"
    else
        SESHAT_RUNTIME_ROOT="$HOME/.config/seshat"
    fi
fi
export SESHAT_RUNTIME_ROOT

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC}  $*"; }
info() { echo -e "${BLUE}  ·${NC}  $*"; }
warn() { echo -e "${YELLOW}  !${NC}  $*"; }
fail() { echo -e "${RED}  ✗${NC}  $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}$*${NC}"; }


# ── 1. Go ────────────────────────────────────────────────────────────────────
step "Checking Go..."

if ! command -v go &>/dev/null; then
    fail "Go not found. Install Go 1.26+ from: https://go.dev/dl/"
fi

GO_VERSION="$(go version | awk '{print $3}' | sed 's/go//')"
GO_MAJOR="$(echo "$GO_VERSION" | cut -d. -f1)"
GO_MINOR="$(echo "$GO_VERSION" | cut -d. -f2)"
if [ "$GO_MAJOR" -lt 1 ] || { [ "$GO_MAJOR" -eq 1 ] && [ "$GO_MINOR" -lt 26 ]; }; then
    fail "Go $GO_VERSION found but 1.26+ is required. Update at: https://go.dev/dl/"
fi
ok "Go $GO_VERSION"

# ── 2. ripgrep ───────────────────────────────────────────────────────────────â”€â”€â”€
# Not a build dependency - a runtime one. seshat-backend embeds the seshat
# engine, and its glob/grep tools shell out to `rg` directly (no pure-Go
# fallback) - without it, every glob/grep tool call fails with "ripgrep (rg)
# not found" the moment a chat session actually tries to use them.
step "Checking ripgrep..."

if command -v rg &>/dev/null; then
    ok "ripgrep $(rg --version | head -1 | awk '{print $2}')"
else
    info "Installing ripgrep..."
    case "$OS" in
        Darwin)
            if command -v brew &>/dev/null; then
                brew install ripgrep
            else
                fail "Homebrew not found. Install it from https://brew.sh/ then re-run setup."
            fi
            ;;
        Linux)
            if command -v apt-get &>/dev/null; then
                sudo apt-get update -qq && sudo apt-get install -y ripgrep
            elif command -v dnf &>/dev/null; then
                sudo dnf install -y ripgrep
            elif command -v pacman &>/dev/null; then
                sudo pacman -S --noconfirm ripgrep
            elif command -v zypper &>/dev/null; then
                sudo zypper install -y ripgrep
            elif command -v apk &>/dev/null; then
                sudo apk add ripgrep
            else
                fail "Cannot detect package manager. Install ripgrep manually:\n  https://github.com/BurntSushi/ripgrep#installation"
            fi
            ;;
        MSYS*|MINGW*|CYGWIN*)
            # Git Bash on Windows - `uname -s` reports something like
            # MSYS_NT-10.0-xxxxx / MINGW64_NT-... here, not a real POSIX
            # distro, so apt/brew/etc never apply. Go through the same
            # Windows package managers setup.ps1 uses.
            if command -v winget.exe &>/dev/null; then
                winget.exe install --id BurntSushi.ripgrep.MSVC --silent --accept-source-agreements --accept-package-agreements
            elif command -v scoop &>/dev/null; then
                scoop install ripgrep
            elif command -v choco.exe &>/dev/null; then
                choco.exe install ripgrep -y
            else
                warn "No winget/scoop/choco found. Install ripgrep manually: https://github.com/BurntSushi/ripgrep/releases (or run scripts\\setup.ps1 from PowerShell instead)."
            fi
            ;;
        *)
            warn "Unknown OS '$OS'. Install ripgrep manually: https://github.com/BurntSushi/ripgrep#installation"
            ;;
    esac
    # Re-check rather than assuming the branch above succeeded - a warn-only
    # fallback (unknown OS, no package manager found) used to still print
    # "ripgrep installed" unconditionally right after it, which was wrong.
    if command -v rg &>/dev/null; then
        ok "ripgrep installed"
    else
        warn "ripgrep still not on PATH. If it just installed via winget, open a new shell (PATH needs a refresh) and re-run setup; otherwise install it manually."
    fi
fi

# ── 3. Node.js ───────────────────────────────────────────────────────────────
step "Checking Node.js..."

if ! command -v node &>/dev/null; then
    fail "Node.js not found. Install Node.js 22+ from: https://nodejs.org/"
fi

NODE_MAJOR="$(node --version | sed 's/v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 22 ]; then
    fail "Node.js $(node --version) found but v22+ is required."
fi
ok "Node.js $(node --version)"

# ── 4. Package manager + Node dependencies ────────────────────────────────────
step "Checking package manager..."

if command -v bun &>/dev/null; then
    PKG_MGR="bun"
    ok "bun $(bun --version)"
elif command -v npm &>/dev/null; then
    PKG_MGR="npm"
    ok "npm $(npm --version)"
else
    fail "Neither bun nor npm found."
fi

step "Installing Node dependencies..."
(
    cd "$UI_DIR"
    if [ "$PKG_MGR" = "bun" ]; then
        bun install
    else
        npm install --legacy-peer-deps
    fi
)
ok "Node dependencies installed"

# ── 5. Python venv + docling-serve (optional) ─────────────────────────────────
if [ "${SKIP_PYTHON:-}" = "1" ]; then
    warn "Skipping Python/docling setup (SKIP_PYTHON=1)"
    warn "Run this script again later without SKIP_PYTHON to enable document conversion."
else
    step "Setting up Python environment (docling-serve)..."
    "$REPO_ROOT/scripts/install-python-env.sh"
fi

# ── 6. Build Go binary + UI ────────────────────────────────────────────────────
step "Building seshat-backend..."
(
    cd "$BACKEND_DIR"
    go build -o bin/seshat-api ./cmd/api
)
ok "seshat-backend"

# go.work (repo root) can optionally point at a local checkout of the seshat
# engine itself (sibling directory, "use ../seshat") for engine development -
# see go.work's `use` block. Without it, seshat-backend builds fine against
# the published module instead; this is informational only.
GO_WORK_PATH="$REPO_ROOT/go.work"
if [ -f "$GO_WORK_PATH" ] && grep -q '\.\./seshat"' "$GO_WORK_PATH" 2>/dev/null; then
    SIBLING_GO_MOD="$(dirname "$REPO_ROOT")/seshat/go.mod"
    if [ -f "$SIBLING_GO_MOD" ]; then
        ok "go.work: local seshat engine checkout found at $(dirname "$SIBLING_GO_MOD")"
    else
        warn "go.work references ../seshat but no go.mod was found there - Go builds will fail until that checkout exists (or remove the 'use ../seshat' line to build against the published module instead)."
    fi
fi

step "Building SeshatOS UI..."
(
    cd "$UI_DIR"
    if [ "$PKG_MGR" = "bun" ]; then
        bun run build
    else
        npm run build
    fi
)
ok "Build complete -> seshat-desktop/out/"

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  Setup complete!${NC}"
echo ""
echo "  Runtime data: $SESHAT_RUNTIME_ROOT"
echo ""
echo "  Start in dev mode (from repo root - see Makefile):"
echo "    make dev"
echo ""
