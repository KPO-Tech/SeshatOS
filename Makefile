# SeshatOS - development Makefile
#
#   make setup          -> first-time setup (system deps, Node deps, build)
#   make dev            -> start the local backend + the Electron UI
#   make build          -> compile the local backend binary
#   make test           -> run the Go tests
#   make disk-usage     -> what is heavy here, and the `make clean-*` that removes it
#
# The recipes are split by subject in mk/: shell.mk (Windows shell), quality.mk (tests, lint), desktop.mk (the Electron app and
# its installers), clean.mk (clean levels). Works from PowerShell, cmd or Git Bash on Windows (see shell.mk).

include mk/shell.mk

ROOT              := $(CURDIR)
CACHE_DIR         ?= $(ROOT)/.cache
GO_PACKAGES       := ./seshat-backend/...
BACKEND_DIR       := $(ROOT)/seshat-backend
BACKEND_CMD       := ./cmd/api
BACKEND_BIN_DIR   := $(BACKEND_DIR)/bin
BACKEND_BIN       := seshat-api
BACKEND_BIN_PATH  := $(BACKEND_BIN_DIR)/$(BACKEND_BIN)
DESKTOP_DIR       := $(ROOT)/seshat-desktop
GO_BUILD_CACHE    := $(CACHE_DIR)/go-build
GOLANGCI_CACHE    := $(CACHE_DIR)/golangci-lint

# The optional native document reading (CGO: pdfium, onnxruntime) needs a C compiler. Without it the Go reader of the backend
# reads DOCX, PPTX, XLSX and the PDFs that have a text layer with no model and nothing to install, losing only a little precision
# on scans and complex layouts. This sets the build flags the native targets need.
NATIVE_ENV = eval "$$("$(BASH)" $(ROOT)/scripts/setup-nativedoc-cgo.sh)"

# The runtime root of the app, where its log is.
RUNTIME_ROOT_SH = $${SESHAT_RUNTIME_ROOT:-$$HOME/.config/seshatos}

.PHONY: help setup dev dev-native stop build build-native run run-native install-cgo-windows logs logs-last

.DEFAULT_GOAL := help

help: ## Show the available targets
	@printf "\n  \033[1mSeshatOS - make targets\033[0m\n\n"
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}'
	@printf "\n"

include mk/quality.mk
include mk/desktop.mk
include mk/clean.mk

# Setup and dev

setup: ## First-time setup: system dependencies (scripts/setup.sh), desktop dependencies and build
	@$(BASH) scripts/setup.sh
	@$(MAKE) --no-print-directory desktop-build

install-cgo-windows: ## Install MSYS2/MinGW-w64 GCC for the native document reading builds on Windows
	powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(ROOT)/scripts/install-windows-cgo.ps1"

dev: stop desktop-install ## Start the local backend + the Electron UI
	@printf "\033[32m[seshatos]\033[0m starting local backend and Electron UI...\n"
	@(cd $(BACKEND_DIR) && go run $(BACKEND_CMD)) & \
	BACKEND_PID=$$!; \
	trap 'kill $$BACKEND_PID 2>/dev/null || true' EXIT INT TERM; \
	cd $(DESKTOP_DIR) && $(UI_PKG_MGR) run start

dev-native: stop desktop-install ## Start the local backend with native document reading (CGO) + the Electron UI
	@printf "\033[32m[seshatos]\033[0m starting local backend (native document reading) and Electron UI...\n"
	@(cd $(BACKEND_DIR) && $(NATIVE_ENV) && SESHAT_NATIVEDOC_AUTO_INIT=1 CGO_ENABLED=1 go run -tags "$$NATIVEDOC_BUILD_TAGS" $(BACKEND_CMD)) & \
	BACKEND_PID=$$!; \
	trap 'kill $$BACKEND_PID 2>/dev/null || true' EXIT INT TERM; \
	cd $(DESKTOP_DIR) && $(UI_PKG_MGR) run start

stop: ## Stop the backend and UI processes
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

build-native: ## Compile the local backend with native document reading (CGO)
	@mkdir -p $(BACKEND_BIN_DIR)
	@cd $(BACKEND_DIR) && $(NATIVE_ENV) && CGO_ENABLED=1 go build -tags "$$NATIVEDOC_BUILD_TAGS" -o ./bin/$(BACKEND_BIN) $(BACKEND_CMD)
	@printf "\033[32m[go]\033[0m native binary ready: %s\n" $(BACKEND_BIN_PATH)

run: ## Run the local backend only (no UI); reads .env.dev / .env
	@cd $(BACKEND_DIR) && go run $(BACKEND_CMD)

run-native: ## Run the local backend only, with native document reading (CGO)
	@cd $(BACKEND_DIR) && $(NATIVE_ENV) && SESHAT_NATIVEDOC_AUTO_INIT=1 CGO_ENABLED=1 go run -tags "$$NATIVEDOC_BUILD_TAGS" $(BACKEND_CMD)

# Logs

logs: ## Tail the backend log in real time (Ctrl-C to exit)
	@LOG="$(RUNTIME_ROOT_SH)/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then printf "\033[32m[logs]\033[0m %s\n\n" "$$LOG"; tail -f "$$LOG"; \
	 else printf "\033[33m[logs]\033[0m no log file at %s - start the backend first.\n" "$$LOG"; fi

logs-last: ## Show the last 200 lines of the backend log
	@LOG="$(RUNTIME_ROOT_SH)/logs/engine.log"; \
	 if [ -f "$$LOG" ]; then tail -200 "$$LOG"; \
	 else printf "\033[33m[logs]\033[0m no log file at %s.\n" "$$LOG"; fi
