# SeshatOS - development Makefile
#
#   make setup          -> first-time setup (system deps, Node deps, build)
#   make dev            -> start the local backend + the Electron UI, with everything on and the native OCR (when there is a C compiler),
#                          keeping your data (FRESH=1 starts as a brand new install, NATIVE=0 builds without the OCR)
#   make dev-reset      -> forget the FRESH=1 install completely, downloads included: the next make dev starts from nothing
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
# The binary make dev runs. A separate name, with the .exe Windows needs, so make build keeps producing what it always did.
BACKEND_DEV_EXE   := seshat-dev$(if $(filter Windows_NT,$(OS)),.exe,)
# The backend with the native OCR is another file: it is linked to pdfium and does not start without it on the path, so a plain
# make dev must never pick it up. make dev and make dev-native used to share one file, and make dev reused whichever was built last.
BACKEND_DEV_NATIVE_EXE := seshat-dev-native$(if $(filter Windows_NT,$(OS)),.exe,)
DESKTOP_DIR       := $(ROOT)/seshat-desktop
GO_BUILD_CACHE    := $(CACHE_DIR)/go-build
GOLANGCI_CACHE    := $(CACHE_DIR)/golangci-lint

# The optional native document reading (CGO: pdfium, onnxruntime) needs a C compiler. Without it the Go reader of the backend
# reads DOCX, PPTX, XLSX and the PDFs that have a text layer with no model and nothing to install, losing only a little precision
# on scans and complex layouts. This sets the build flags the native targets need.
NATIVE_ENV = eval "$$("$(BASH)" $(ROOT)/scripts/setup-nativedoc-cgo.sh)"

# The runtime root of the app, where its log is.
RUNTIME_ROOT_SH = $${SESHAT_RUNTIME_ROOT:-$$HOME/.config/seshatos}

# make dev keeps your data between starts by default (FRESH=0): the providers you configured, your sessions and the wizard you already
# went through are still there. FRESH=1 starts as a brand new install instead: an empty runtime root, so the first-run wizard
# shows, there is no account, no session, no model, nothing the app remembered. The root is a throwaway folder of this project
# (.cache/dev-fresh), wiped at each start; your real data (~/.config/seshat) is never read or touched. Everything the app keeps sits
# under that root, the backend database and the models as much as Electron's own storage.
#
#   make dev FRESH=1             a brand new install, to try the first run
#   make dev KEEP_MODELS=0        also forget the models and the engines downloaded earlier, to try the first download
#
# What was downloaded (the models of the titles, the voice and the OCR, and the engines that run them) is kept by default: it is
# several hundred megabytes, and the wizard still shows, finds what is already there and does not download it twice.
FRESH             ?= 0
KEEP_MODELS       ?= 1
FRESH_ROOT        := $(CACHE_DIR)/dev-fresh

# The backend of make dev is built with the native OCR (the reading of scanned documents) whenever a C compiler is found, so that the
# app you run is the app you ship and the first-run wizard offers the scanned documents. The first build downloads the native libraries
# (pdfium, onnxruntime) and takes a few minutes; the next ones are quick.
#   make dev              with the OCR if there is a C compiler, without otherwise
#   make dev NATIVE=0     without the OCR (a quicker build, the box of the scanned documents is then greyed out)
#   make dev NATIVE=1     with the OCR, and fail when there is no C compiler (make install-cgo-windows installs one)
NATIVE            ?= auto
HAS_CC            := $(shell command -v gcc 2>/dev/null || command -v cc 2>/dev/null)
ifeq ($(NATIVE),1)
DEV_NATIVE        := 1
else ifeq ($(NATIVE),0)
DEV_NATIVE        :=
else
DEV_NATIVE        := $(if $(HAS_CC),1,)
endif
ifeq ($(DEV_NATIVE),1)
DEV_BACKEND_TARGET := dev-backend-native
DEV_BACKEND_EXE    := $(BACKEND_DEV_NATIVE_EXE)
# The backend and the app both run with the native library path: the backend is linked to pdfium and does not start without it, and the
# wizard of the app starts it to list and download the OCR models.
DEV_WITH_NATIVE    := $(NATIVE_ENV) &&
DEV_BACKEND_INIT   := SESHAT_NATIVEDOC_AUTO_INIT=1
DEV_KIND           := with the native OCR
else
DEV_BACKEND_TARGET := dev-backend
DEV_BACKEND_EXE    := $(BACKEND_DEV_EXE)
DEV_WITH_NATIVE    :=
DEV_BACKEND_INIT   :=
DEV_KIND           := without the native OCR$(if $(HAS_CC),, (no C compiler found: make install-cgo-windows))
endif

# What every dev start exports. SESHAT_SETUP_BACKEND lets the wizard of an unpackaged app run the commands of the backend built here
# (it has no bundled one).
DEV_EXPORTS        = export SESHAT_SETUP_BACKEND="$(BACKEND_DIR)/bin/$(DEV_BACKEND_EXE)";
ifeq ($(FRESH),1)
DEV_EXPORTS       += export SESHAT_RUNTIME_ROOT="$(FRESH_ROOT)"; export SESHAT_FORCE_SETUP=1;
endif

.PHONY: help setup dev dev-next dev-native dev-fresh-state dev-reset dev-backend dev-backend-native stop build build-native run run-native install-cgo-windows logs logs-last

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

# make dev starts a built binary, not go run. go run links a new executable of about 100 MB at every start (and the antivirus scans it
# before it runs), which was most of the wait: on a machine with a slow disk, minutes. go build links only when a source changed, so
# the second start is quick.
# Even go build costs a while on a slow disk (it checks every package), so nothing is built when no file of the backend is newer than
# the binary.
dev-backend:
	@mkdir -p $(BACKEND_BIN_DIR)
	@if [ -f "$(BACKEND_BIN_DIR)/$(BACKEND_DEV_EXE)" ] && go version -m "$(BACKEND_BIN_DIR)/$(BACKEND_DEV_EXE)" 2>/dev/null | grep -q 'tags=.*nativedoc'; then \
	  printf "\033[33m[go]\033[0m %s was built with the native OCR and needs pdfium to start: removed, it is rebuilt without\n" $(BACKEND_DEV_EXE); \
	  rm -f "$(BACKEND_BIN_DIR)/$(BACKEND_DEV_EXE)"; \
	fi
	@if [ -f "$(BACKEND_BIN_DIR)/$(BACKEND_DEV_EXE)" ] && [ -z "$$(find $(BACKEND_DIR) $(ROOT)/go.work -path $(BACKEND_BIN_DIR) -prune -o -type f -newer $(BACKEND_BIN_DIR)/$(BACKEND_DEV_EXE) -print -quit)" ]; then \
	  printf "\033[32m[go]\033[0m backend up to date, not rebuilt\n"; \
	else \
	  printf "\033[32m[go]\033[0m building the backend...\n"; \
	  cd $(BACKEND_DIR) && go build -o ./bin/$(BACKEND_DEV_EXE) $(BACKEND_CMD); \
	fi

dev-backend-native:
	@mkdir -p $(BACKEND_BIN_DIR)
	@cd $(BACKEND_DIR) && $(NATIVE_ENV) && CGO_ENABLED=1 go build -tags "$$NATIVEDOC_BUILD_TAGS" -o ./bin/$(BACKEND_DEV_NATIVE_EXE) $(BACKEND_CMD)

# Empties the runtime root of a fresh start (see FRESH above). It only ever wipes a folder named dev-fresh, whatever CACHE_DIR is.
dev-fresh-state:
	@if [ "$(FRESH)" = "1" ]; then \
	  case "$(FRESH_ROOT)" in */dev-fresh) ;; *) echo "refusing to wipe $(FRESH_ROOT)"; exit 1 ;; esac; \
	  kept="$(FRESH_ROOT).kept"; rm -rf "$$kept"; \
	  if [ "$(KEEP_MODELS)" = "1" ]; then \
	    for p in models llama/bin whisper/bin; do \
	      if [ -e "$(FRESH_ROOT)/$$p" ]; then mkdir -p "$$kept/$$(dirname $$p)"; mv "$(FRESH_ROOT)/$$p" "$$kept/$$p"; fi; \
	    done; \
	    for f in "$(FRESH_ROOT)"/whisper/ggml-*.bin; do \
	      if [ -e "$$f" ]; then mkdir -p "$$kept/whisper"; mv "$$f" "$$kept/whisper/"; fi; \
	    done; \
	  fi; \
	  rm -rf "$(FRESH_ROOT)"; \
	  if [ -d "$$kept" ]; then mv "$$kept" "$(FRESH_ROOT)"; else mkdir -p "$(FRESH_ROOT)"; fi; \
	  printf "\033[32m[seshatos]\033[0m fresh start: a new install in %s (your own data is not touched; FRESH=0 to use it)\n" "$(FRESH_ROOT)"; \
	  if [ "$(KEEP_MODELS)" = "1" ]; then printf "\033[32m[seshatos]\033[0m the models and engines downloaded earlier are kept (KEEP_MODELS=0 to download them again)\n"; fi; \
	else \
	  printf "\033[33m[seshatos]\033[0m using your own data (FRESH=0)\n"; \
	fi

# Forgets everything of the fresh dev install, the downloads (models and engines) included: the next make dev starts from nothing and
# downloads again. It stops the app first, files under a running app cannot be removed. It only ever removes the throwaway folder of
# this project (.cache/dev-fresh, and what a start left beside it): your own data (~/.config/seshat) is never read or touched.
dev-reset: stop ## Forget the fresh dev install completely, downloads included (your own data is not touched)
	@case "$(FRESH_ROOT)" in */dev-fresh) ;; *) echo "refusing to remove $(FRESH_ROOT)"; exit 1 ;; esac; \
	if [ -e "$(FRESH_ROOT)" ] || [ -e "$(FRESH_ROOT).kept" ]; then \
	  size="$$(du -sh "$(FRESH_ROOT)" 2>/dev/null | cut -f1)"; \
	  rm -rf "$(FRESH_ROOT)" "$(FRESH_ROOT).kept"; \
	  if [ -e "$(FRESH_ROOT)" ]; then printf "\033[31m[seshatos]\033[0m could not remove everything of %s: a program still uses it, close it and run make dev-reset again\n" "$(FRESH_ROOT)"; exit 1; fi; \
	  printf "\033[32m[seshatos]\033[0m forgot the fresh dev install (%s freed): the next make dev starts from nothing and downloads again\n" "$${size:-0}"; \
	else \
	  printf "\033[32m[seshatos]\033[0m nothing to forget: there is no fresh dev install\n"; \
	fi

dev: stop desktop-install $(DEV_BACKEND_TARGET) dev-fresh-state ## Start the local backend (with the native OCR when there is a C compiler) + the Electron UI, as a brand new install
	@printf "\033[32m[seshatos]\033[0m starting local backend ($(DEV_KIND)) and Electron UI...\n"
	@$(DEV_EXPORTS) (cd $(BACKEND_DIR) && $(DEV_WITH_NATIVE) $(DEV_BACKEND_INIT) ./bin/$(DEV_BACKEND_EXE)) & \
	BACKEND_PID=$$!; \
	trap 'kill $$BACKEND_PID 2>/dev/null || true' EXIT INT TERM; \
	cd $(DESKTOP_DIR) && $(DEV_EXPORTS) $(DEV_WITH_NATIVE) $(UI_PKG_MGR) run start

# There is one version of the app now (see seshat-desktop/src/renderer/lib/edition.ts), and one command to run it. These two only stay so that
# the commands still work: dev-next was the second version, dev-native is make dev with the OCR required.
dev-next: dev

dev-native:
	@$(MAKE) --no-print-directory dev NATIVE=1

stop: ## Stop the backend and UI processes
	@if command -v pkill >/dev/null 2>&1; then \
	  pkill -f "go run.*cmd/api" 2>/dev/null || true; \
	  pkill -x api 2>/dev/null || true; \
	  pkill -x $(BACKEND_BIN) 2>/dev/null || true; \
	  pkill -x seshat-dev 2>/dev/null || true; \
	  pkill -x seshat-dev-native 2>/dev/null || true; \
	  pkill -f "electron-vite" 2>/dev/null || true; \
	  pkill -f "[e]lectron.*seshatos" 2>/dev/null || true; \
	elif command -v powershell.exe >/dev/null 2>&1; then \
	  powershell.exe -NoProfile -Command \
	    "Get-CimInstance Win32_Process | Where-Object { \$$_.Name -match '^(api|go|seshat-api|seshat-dev|seshat-dev-native)(\.exe)?\$$' -or (\$$_.Name -match '^(electron|node)(\.exe)?\$$' -and \$$_.CommandLine -match 'electron-vite|seshat-desktop') } | ForEach-Object { Stop-Process -Id \$$_.ProcessId -Force -ErrorAction SilentlyContinue }" \
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
