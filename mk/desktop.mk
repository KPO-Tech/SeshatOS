# The Electron desktop app, and its installers.

# UI package manager: bun when it is installed (faster, what CI and most contributors use), npm otherwise (a fresh Windows
# machine). Both understand `install` and `run <script>` the same way. Asked through $(SHELL) so that it also resolves on
# Windows (see shell.mk).
UI_PKG_MGR := $(shell $(SHELL) -c 'command -v bun >/dev/null 2>&1 && echo bun || echo npm')

.PHONY: desktop-install desktop-build desktop-dev \
        desktop-package-win desktop-package-linux desktop-package-win-native desktop-package-linux-native

desktop-install: ## Install the desktop dependencies (skipped when node_modules is complete)
	@if [ ! -d "$(DESKTOP_DIR)/node_modules" ] || [ ! -f "$(DESKTOP_DIR)/node_modules/electron/path.txt" ]; then \
	  printf "\033[32m[desktop]\033[0m installing dependencies with %s...\n" $(UI_PKG_MGR); \
	  cd $(DESKTOP_DIR) && $(UI_PKG_MGR) install; \
	else \
	  printf "\033[32m[desktop]\033[0m node_modules present - skipping install\n"; \
	fi

desktop-build: desktop-install build ## Build the desktop app and the local backend
	cd $(DESKTOP_DIR) && $(UI_PKG_MGR) run build

desktop-dev: desktop-install ## Start the desktop app in dev mode
	cd $(DESKTOP_DIR) && $(UI_PKG_MGR) run start

# An installer (electron-builder) is much slower than `make dev` but is the artifact users run. Each target is for the OS it is
# run on (electron-builder cannot reliably cross-package). The default sidecar has no native document reading (CGO off); the
# -native targets build one with it, which needs a C compiler. See docs/desktop-packaging.md.

desktop-package-win: desktop-install ## Package a Windows .exe installer (run on Windows)
	cd $(DESKTOP_DIR) && $(UI_PKG_MGR) run package:win
	@printf "\033[32m[desktop]\033[0m installer ready: %s\n" "$(DESKTOP_DIR)/dist"

desktop-package-linux: desktop-install ## Package a Linux AppImage + .deb (run on Linux)
	cd $(DESKTOP_DIR) && $(UI_PKG_MGR) run package:linux
	@printf "\033[32m[desktop]\033[0m artifacts ready: %s\n" "$(DESKTOP_DIR)/dist"

desktop-package-win-native: desktop-install ## Package a Windows installer with native document reading (CGO, needs MinGW GCC)
	cd $(DESKTOP_DIR) && $(UI_PKG_MGR) run package:win:nativedoc
	@printf "\033[32m[desktop]\033[0m installer ready: %s\n" "$(DESKTOP_DIR)/dist"

desktop-package-linux-native: desktop-install ## Package a Linux AppImage + .deb with native document reading (CGO)
	cd $(DESKTOP_DIR) && $(UI_PKG_MGR) run package:linux:nativedoc
	@printf "\033[32m[desktop]\033[0m artifacts ready: %s\n" "$(DESKTOP_DIR)/dist"
