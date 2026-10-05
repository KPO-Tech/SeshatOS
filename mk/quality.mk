# Tests and code quality of the Go module (seshat-backend).

.PHONY: test test-v test-race test-short test-pkg fmt vet lint tidy hooks

test: ## Run all Go tests of the backend module
	go test $(GO_PACKAGES)

test-v: ## Run all Go tests - verbose output
	go test -v $(GO_PACKAGES)

test-race: ## Run all Go tests with the race detector
	go test -race $(GO_PACKAGES)

test-short: ## Run fast unit tests only (skips DB-backed tests)
	go test -short $(GO_PACKAGES)

test-pkg: ## Run the tests of one package (PKG=./seshat-backend/internal/files/...)
	go test -v $(PKG)

fmt: ## Format the Go sources of the backend module with gofmt
	gofmt -w $$(find $(BACKEND_DIR) -name '*.go' -not -path '*/vendor/*')

vet: ## Run go vet on the backend module
	@mkdir -p $(GO_BUILD_CACHE)
	GOCACHE=$(GO_BUILD_CACHE) go vet $(GO_PACKAGES)

lint: vet ## vet + gofmt check + golangci-lint
	@UNFORMATTED=$$(find $(BACKEND_DIR) -name '*.go' -not -path '*/vendor/*' | xargs gofmt -l); \
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

hooks: ## Install the git hooks of .githooks/
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit
	@printf "\033[32m[hooks]\033[0m pre-commit hook installed.\n"
