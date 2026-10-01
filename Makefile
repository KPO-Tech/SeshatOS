# SeshatOS - Development Makefile
#
#   make setup          -> first-time setup (Node deps + docling + build)
#   make dev            -> start local backend + Electron UI
#   make build          -> compile the local backend binary
#   make test           -> run all Go tests in the workspace
#   make install-python -> install / update docling-serve
#   make start-docling  -> start docling-serve manually
#
# Windows: works from PowerShell, cmd, or Git Bash. Two separate things need
# fixing, both handled below from a bare "Git for Windows installed" state:
#   1. Which shell runs a recipe - GNU Make's own shell-detection doesn't
#      pick up Git's sh.exe from a plain PowerShell/cmd PATH the way a Git
#      Bash session already does, so SHELL is pointed at it explicitly.
#   2. Make's Windows port bypasses the shell for recipe lines it judges
#      "simple" (no quotes/operators) and execs the first word directly via
#      CreateProcess - so coreutils this file uses throughout (mkdir, rm,
#      printf, awk, ...) need to resolve on PATH even for that bypassed
#      case, not only when a real shell ends up running them. Git's usr/bin
#      (not bin - that one only has sh.exe/bash.exe) ships all of them.
# UI package manager and process-kill in `stop` auto-detect and fall back to
# npm/PowerShell separately, for machines without bun/pkill installed.

ifeq ($(OS),Windows_NT)
  ifneq ($(wildcard C:/Program\ Files/Git/bin/sh.exe),)
    GIT_ROOT_WIN := C:/Program Files/Git
  else ifneq ($(wildcard C:/Program\ Files\ (x86)/Git/bin/sh.exe),)
    GIT_ROOT_WIN := C:/Program Files (x86)/Git
  else ifneq ($(wildcard $(subst \,/,$(LOCALAPPDATA))/Programs/Git/bin/sh.exe),)
    GIT_ROOT_WIN := $(subst \,/,$(LOCALAPPDATA))/Programs/Git
  endif
  ifneq ($(GIT_ROOT_WIN),)
    SHELL := $(GIT_ROOT_WIN)/bin/sh.exe
    .SHELLFLAGS := -c
    BASH := $(GIT_ROOT_WIN)/bin/bash.exe
    export PATH := $(GIT_ROOT_WIN)/usr/bin;$(PATH)
  endif
  ifneq ($(wildcard C:/msys64/mingw64/bin/gcc.exe),)
    export PATH := C:/msys64/mingw64/bin;$(PATH)
  else ifneq ($(wildcard $(subst \,/,$(LOCALAPPDATA))/Programs/MSYS2/mingw64/bin/gcc.exe),)
    export PATH := $(subst \,/,$(LOCALAPPDATA))/Programs/MSYS2/mingw64/bin;$(PATH)
  endif
endif
BASH ?= bash

ROOT              := $(CURDIR)
GO_PACKAGES       := ./seshat-backend/...
LINT_PACKAGES     := ./seshat-backend/...
BACKEND_DIR       := $(ROOT)/seshat-backend
BACKEND_CMD       := ./cmd/api
BACKEND_BIN_DIR   := $(BACKEND_DIR)/bin
BACKEND_BIN       := seshat-api
BACKEND_BIN_PATH  := $(BACKEND_BIN_DIR)/$(BACKEND_BIN)
DESKTOP_DIR       := $(ROOT)/seshat-desktop
UI_DIR            := $(DESKTOP_DIR)
GO_BUILD_CACHE    := $(ROOT)/.cache/go-build
GOLANGCI_CACHE    := $(ROOT)/.cache/golangci-lint

# UI package manager: prefer bun (faster, what CI/most contributors use), but
# fall back to npm when bun isn't installed - e.g. a fresh Windows machine.
# Both understand `install` and `run <script>` identically, so every ui-*
# target below works unmodified under either. Routed through $(SHELL)
# explicitly (not bare $(shell ...)) so this also resolves correctly on
# Windows - see the SHELL auto-detection note above.
UI_PKG_MGR := $(shell $(SHELL) -c 'command -v bun >/dev/null 2>&1 && echo bun || echo npm')

.PHONY: help \
        setup \
        dev stop \
        build run \
        test test-v test-race test-short test-pkg \
        fmt vet lint tidy hooks \
        ui-install ui-build ui-dev ui-package-win ui-package-linux \
        desktop-install desktop-build desktop-dev desktop-package-win desktop-package-linux \
        install-python start-docling \
        logs logs-last logs-docling \
        clean clean-all clean-tmp

.DEFAULT_GOAL := help

# Help

help: ## Show available targets
	@printf "\n  \033[1mSeshatOS - make targets\033[0m\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@printf "\n"

# Dev lifecycle

install-cgo-windows: ## Install MSYS2/MinGW-w64 GCC for nativedoc CGO builds on Windows
	powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(ROOT)/scripts/install-windows-cgo.ps1"

dev: stop ui-install ## Start local backend + Electron UI
	@printf "\033[32m[seshatos]\033[0m starting local backend...\n"
	@printf "\033[32m[seshatos]\033[0m starting Electron UI...\n"
	@(cd $(BACKEND_DIR) && go run $(BACKEND_CMD)) & \
	BACKEND_PID=$$!; \
	trap 'kill $$BACKEND_PID 2>/dev/null || true' EXIT INT TERM; \
	cd $(UI_DIR) && $(UI_PKG_MGR) run start

dev-native: stop ui-install ## Start local backend with nativedoc CGO + Electron UI
	@printf "\033[32m[seshatos]\033[0m preparing nativedoc CGO dependencies...\n"
	@printf "\033[32m[seshatos]\033[0m starting local backend with native OCR support...\n"
	@printf "\033[32m[seshatos]\033[0m starting Electron UI...\n"
	@NATIVEDOC_ENV="$$(mktemp)"; \
	"$(BASH)" "$(ROOT)/scripts/setup-nativedoc-cgo.sh" > "$$NATIVEDOC_ENV"; \
	. "$$NATIVEDOC_ENV"; \
	rm -f "$$NATIVEDOC_ENV"; \
	(cd $(BACKEND_DIR) && SESHAT_NATIVEDOC_AUTO_INIT=1 CGO_ENABLED=1 go run -tags "$$NATIVEDOC_BUILD_TAGS" $(BACKEND_CMD)) & \
	BACKEND_PID=$$!; \
	trap 'kill $$BACKEND_PID 2>/dev/null || true' EXIT INT TERM; \
	cd $(UI_DIR) && $(UI_PKG_MGR) run start

stop: ## Stop backend and UI processes
	@if command -v pkill >/dev/null 2>&1; then \
	  pkill -f "go run.*cmd/api" 2>/dev/null || true; \
	  pkill -x api 2>/dev/null || true; \
	  pkill -x $(BACKEND_BIN) 2>/dev/null || true; \
	  pkill -f "electron-vite" 2>/dev/null || true; \
	  pkill -f "[e]lectron.*seshatos" 2>/dev/null || true; \
	elif command -v powershell.exe >/dev/null 2>&1; then \
	  powershell.exe -NoProfile -Command \
	    "Get-CimInstance Win32_Process | Where-Object { \$$_.Name -match '^(api|go|seshat-api)(\.exe)?\$$' -or (\$$_.Name -match '^(electron|node)(\.exe)?\$$' -and \$$_.CommandLine -match 'electron-vite|seshat-desktop') } | ForEach-Object { Stop-Process -Id \$$_.ProcessId -Force -ErrorAction SilentlyContinue }" \
	    2>/dev/null || true; \
	fi
	@printf "\033[32m[seshatos]\033[0m stopped.\n"

# Backend

build: ## Compile the local backend binary -> seshat-backend/bin/seshat-api
	@printf "\033[32m[go]\033[0m building %s...\n" $(BACKEND_BIN)
	@mkdir -p $(BACKEND_BIN_DIR)
	@cd $(BACKEND_DIR) && go build -o ./bin/$(BACKEND_BIN) $(BACKEND_CMD)
	@printf "\033[32m[go]\033[0m binary ready: %s\n" $(BACKEND_BIN_PATH)

build-native: ## Compile local backend with nativedoc CGO support
	@printf "\033[32m[go]\033[0m preparing nativedoc CGO dependencies...\n"
	@mkdir -p $(BACKEND_BIN_DIR)
	@cd $(BACKEND_DIR) && eval "$$("$(BASH)" $(ROOT)/scripts/setup-nativedoc-cgo.sh)" && CGO_ENABLED=1 go build -tags "$$NATIVEDOC_BUILD_TAGS" -o ./bin/$(BACKEND_BIN) $(BACKEND_CMD)
	@printf "\033[32m[go]\033[0m nativedoc binary ready: %s\n" $(BACKEND_BIN_PATH)

run: ## Run the local backend only (no UI), reads .env.dev / .env
	@cd $(BACKEND_DIR) && go run $(BACKEND_CMD)

run-native: ## Run the local backend with nativedoc CGO support
	@cd $(BACKEND_DIR) && eval "$$("$(BASH)" $(ROOT)/scripts/setup-nativedoc-cgo.sh)" && SESHAT_NATIVEDOC_AUTO_INIT=1 CGO_ENABLED=1 go run -tags "$$NATIVEDOC_BUILD_TAGS" $(BACKEND_CMD)

# Tests

test: ## Run all Go tests in the workspace
	go test $(GO_PACKAGES)

test-v: ## Run all tests - verbose output
	go test -v $(GO_PACKAGES)

test-race: ## Run all tests with the race detector
	go test -race $(GO_PACKAGES)

test-short: ## Run fast unit tests only (skips DB-backed tests)
	go test -short $(GO_PACKAGES)

test-pkg: ## Run tests for a specific package (PKG=./seshat-backend/internal/files/...)
	go test -v $(PKG)

# Code quality

fmt: ## Format all Go source files with gofmt
	gofmt -w $(shell $(SHELL) -c 'find . -name "*.go" -not -path "./vendor/*"')

vet: ## Run go vet across the backend module
	@mkdir -p $(GO_BUILD_CACHE)
	GOCACHE=$(GO_BUILD_CACHE) go vet $(GO_PACKAGES)

lint: vet ## vet + gofmt check + golangci-lint
	@UNFORMATTED=$$(find . -name "*.go" -not -path "./vendor/*" | xargs gofmt -l); \
	if [ -n "$$UNFORMATTED" ]; then \
	  printf "\033[31m[lint]\033[0m Go files need formatting (run: make fmt):\n%s\n" "$$UNFORMATTED"; \
	  exit 1; \
	fi
	@mkdir -p $(GO_BUILD_CACHE) $(GOLANGCI_CACHE)
	@if command -v golangci-lint >/dev/null 2>&1; then \
	  cd $(BACKEND_DIR) && GOCACHE=$(GO_BUILD_CACHE) GOLANGCI_LINT_CACHE=$(GOLANGCI_CACHE) golangci-lint run --timeout=5m ./...; \
	else \
	  printf "\033[33m[warn]\033[0m golangci-lint not found - install with:\n       go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest\n"; \
	fi

tidy: ## go mod tidy + verify for the backend module
	@cd $(BACKEND_DIR) && go mod tidy && go mod verify

hooks: ## Install git hooks from .githooks/
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit
	@printf "\033[32m[hooks]\033[0m pre-commit hook installed.\n"

# Desktop

ui-install: desktop-install ## Alias for desktop-install
ui-build: desktop-build ## Alias for desktop-build
ui-dev: desktop-dev ## Alias for desktop-dev
ui-package-win: desktop-package-win ## Alias for desktop-package-win
ui-package-linux: desktop-package-linux ## Alias for desktop-package-linux

desktop-install: ## Install desktop Electron dependencies
	@if [ ! -d "$(UI_DIR)/node_modules" ] || [ ! -f "$(UI_DIR)/node_modules/electron/path.txt" ]; then \
	  printf "\033[32m[desktop]\033[0m installing dependencies with %s...\n" $(UI_PKG_MGR); \
	  cd $(UI_DIR) && $(UI_PKG_MGR) install; \
	else \
	  printf "\033[32m[desktop]\033[0m node_modules present - skipping install\n"; \
	fi

desktop-build: desktop-install build ## Build desktop Electron app and local backend
	cd $(UI_DIR) && $(UI_PKG_MGR) run build

desktop-dev: desktop-install ## Start desktop Electron dev app
	cd $(UI_DIR) && $(UI_PKG_MGR) run start

# Packaging a real installer (electron-builder) is much slower than `make dev`
# but produces the actual artifact users run. Each target is host-OS-specific
# (electron-builder cannot reliably cross-package): run desktop-package-win
# on Windows, desktop-package-linux on Linux/CI. See docs/desktop-packaging.md.

desktop-package-win: desktop-install ## Package a Windows .exe installer (run on Windows)
	cd $(UI_DIR) && $(UI_PKG_MGR) run package:win
	@printf "\033[32m[desktop]\033[0m installer ready: %s\n" "$(UI_DIR)/dist"

desktop-package-linux: desktop-install ## Package a Linux AppImage + .deb (run on Linux)
	cd $(UI_DIR) && $(UI_PKG_MGR) run package:linux
	@printf "\033[32m[desktop]\033[0m artifacts ready: %s\n" "$(UI_DIR)/dist"

# Setup

setup: setup-legacy desktop-build ## First-time setup (system deps + docling + desktop build)

setup-legacy: ## Legacy setup script path (system deps + desktop-only build)
	@bash scripts/setup.sh

# Python / docling (optional feature)
# install-python creates the managed venv and installs docling-serve.
# Called automatically by `make setup`. Use to install or update docling.
#
# Options (env vars):
#   DOCLING_EXTRAS=gpu      -> GPU-accelerated conversion
#   PYTHON_VERSION=3.12     -> specific Python version

install-python: ## Install / update docling-serve in the managed venv
	@bash scripts/install-python-env.sh

# Start docling-serve manually.
# The backend auto-starts it at launch when the venv is installed.
# Use this only to run it as a standalone process.

start-docling: ## Start docling-serve manually (auto-started by the backend)
	@bash scripts/start-docling.sh

# Logs

logs: ## Tail the backend log in real time (Ctrl-C to exit)
	@RUNTIME_ROOT=$${SESHAT_RUNTIME_ROOT:-$$HOME/.config/seshatos}; \
	 LOG="$$RUNTIME_ROOT/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then \
	   printf "\033[32m[logs]\033[0m %s\n\n" "$$LOG"; \
	   tail -f "$$LOG"; \
	 else \
	   printf "\033[33m[logs]\033[0m no log file at %s - start the backend first.\n" "$$LOG"; \
	 fi

logs-last: ## Show the last 200 lines of the backend log
	@RUNTIME_ROOT=$${SESHAT_RUNTIME_ROOT:-$$HOME/.config/seshatos}; \
	 LOG="$$RUNTIME_ROOT/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then \
	   tail -200 "$$LOG"; \
	 else \
	   printf "\033[33m[logs]\033[0m no log file at %s.\n" "$$LOG"; \
	 fi

logs-docling: ## Tail the docling-serve log in real time (Ctrl-C to exit)
	@RUNTIME_ROOT=$${SESHAT_RUNTIME_ROOT:-$$HOME/.config/seshatos}; \
	 LOG="$$RUNTIME_ROOT/logs/docling.log"; \
	 if [ -f "$$LOG" ]; then \
	   printf "\033[32m[logs]\033[0m %s\n\n" "$$LOG"; \
	   tail -f "$$LOG"; \
	 else \
	   printf "\033[33m[logs]\033[0m no docling log at %s - start the backend first.\n" "$$LOG"; \
	 fi

# Cleanup

clean: ## Remove compiled backend binary and module build artifacts
	rm -f $(BACKEND_BIN_PATH)
	@cd $(BACKEND_DIR) && go clean

clean-all: clean ## Remove Go build cache, UI node_modules + dist
	go clean -cache
	rm -rf $(UI_DIR)/node_modules $(UI_DIR)/dist $(UI_DIR)/out
	@printf "\033[32m[clean]\033[0m done.\n"

CLEAN_TMP_PRUNE := \( -path '*/node_modules' -o -path '*/.git' -o -name '.venv' \) -prune

clean-tmp: ## Remove Python/Go/Node cache and temp clutter (pycache, .pytest_cache, .tsbuildinfo, ...)
	@printf "\033[32m[clean-tmp]\033[0m sweeping cache/temp clutter...\n"
	@find $(ROOT) $(CLEAN_TMP_PRUNE) -o -type d \( -name '__pycache__' -o -name '.pytest_cache' -o -name '.mypy_cache' -o -name '.ruff_cache' -o -name '*.egg-info' -o -name '.turbo' \) -print -exec rm -rf {} + 2>/dev/null; \
	 find $(ROOT) $(CLEAN_TMP_PRUNE) -o -type f \( -name '*.pyc' -o -name '*.pyo' -o -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*.tsbuildinfo' \) -print -delete 2>/dev/null; \
	 find $(BACKEND_DIR) -maxdepth 1 -type f \( -name 'debug' -o -name '__debug_bin*' -o -name '*.test' \) -print -delete 2>/dev/null; \
	 true
	@printf "\033[32m[clean-tmp]\033[0m done.\n"
