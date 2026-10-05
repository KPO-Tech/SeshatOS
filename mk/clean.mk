# Cleaning, in levels from the cheap to the heavy. `make disk-usage` shows what each level would free; the heavy one asks first
# (FORCE=1 skips the question). Nothing here touches the Go cache of the whole machine except clean-go-global, and nothing
# touches the runtime root of the app (~/.config/seshatos: the sessions, the data and the models a person downloaded).
#
#   clean          build outputs                          (rebuilt by the next build)
#   clean-cache    caches of this project and clutter     (rebuilt by the next lint/vet)
#   clean-deps     node_modules                           (reinstalled by desktop-install)
#   clean-all      all of the above, with the installers  (asks first)

FORCE ?=

# CONFIRM(question): ask for "yes" unless FORCE=1.
CONFIRM = if [ "$(FORCE)" != "1" ]; then printf "%s Type yes to continue: " "$(1)"; read ans; [ "$$ans" = "yes" ] || { echo "cancelled."; exit 1; }; fi
# SIZE(label, path, level): one line of disk-usage, if the path exists.
SIZE = if [ -e "$(2)" ]; then printf "  %-30s %9s   %s\n" "$(1)" "$$(du -sh "$(2)" 2>/dev/null | cut -f1)" "$(3)"; fi

.PHONY: clean clean-cache clean-deps clean-all clean-go-global disk-usage

disk-usage: ## Show the size of what each clean level removes
	@printf "\n  \033[1mSeshatOS - disk usage\033[0m\n\n"
	@$(call SIZE,backend binary,$(BACKEND_BIN_DIR),make clean)
	@$(call SIZE,sidecar in the desktop,$(DESKTOP_DIR)/resources/backend,make clean)
	@$(call SIZE,desktop build,$(DESKTOP_DIR)/out,make clean)
	@$(call SIZE,installers,$(DESKTOP_DIR)/dist,make clean-all)
	@$(call SIZE,Go build cache (project),$(GO_BUILD_CACHE),make clean-cache)
	@$(call SIZE,golangci-lint cache,$(GOLANGCI_CACHE),make clean-cache)
	@$(call SIZE,desktop node_modules,$(DESKTOP_DIR)/node_modules,make clean-deps)
	@printf "\n  The runtime root of the app is never cleaned here.\n\n"

clean: ## Remove the backend binary, the sidecar and the desktop build
	rm -f $(BACKEND_BIN_PATH)
	rm -rf $(DESKTOP_DIR)/out
	rm -f $(DESKTOP_DIR)/resources/backend/seshat-backend $(DESKTOP_DIR)/resources/backend/seshat-backend.exe
	@cd $(BACKEND_DIR) && go clean
	@printf "\033[32m[clean]\033[0m build outputs removed.\n"

clean-cache: ## Remove the caches of this project (.cache/go-build, golangci-lint) and editor/OS clutter
	rm -rf $(GO_BUILD_CACHE) $(GOLANGCI_CACHE)
	@find $(ROOT) \( -path '*/node_modules' -o -path '*/.git' -o -path '$(CACHE_DIR)' \) -prune -o \
	   -type f \( -name '.DS_Store' -o -name 'Thumbs.db' -o -name '*.tsbuildinfo' \) -print -delete 2>/dev/null; \
	 find $(ROOT) \( -path '*/node_modules' -o -path '*/.git' -o -path '$(CACHE_DIR)' \) -prune -o \
	   -type d -name '.turbo' -print -exec rm -rf {} + 2>/dev/null; \
	 find $(BACKEND_DIR) -maxdepth 1 -type f \( -name 'debug' -o -name '__debug_bin*' -o -name '*.test' \) -print -delete 2>/dev/null; \
	 true
	@printf "\033[32m[clean]\033[0m caches removed.\n"

clean-deps: ## Remove the desktop node_modules
	rm -rf $(DESKTOP_DIR)/node_modules
	@printf "\033[32m[clean]\033[0m dependencies removed (make desktop-install).\n"

clean-all: ## clean + clean-cache + clean-deps + the installers (asks first)
	@$(call CONFIRM,This removes build outputs and caches and node_modules and the installers in seshat-desktop/dist.)
	@rm -rf $(DESKTOP_DIR)/dist
	@$(MAKE) --no-print-directory FORCE=1 clean clean-cache clean-deps

clean-go-global: ## Empty the Go build and test cache of the WHOLE machine (every project)
	go clean -cache -testcache
