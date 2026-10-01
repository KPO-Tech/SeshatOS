package api

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime/debug"
	"strings"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type requestIDKeyType struct{}

var requestIDKey requestIDKeyType

func requestIDFromContext(ctx context.Context) string {
	if id, ok := ctx.Value(requestIDKey).(string); ok {
		return id
	}
	return ""
}

func newRequestID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// logError writes a structured error line to stderr with the request ID when available.
func logError(r *http.Request, format string, args ...any) {
	id := requestIDFromContext(r.Context())
	if id != "" {
		fmt.Fprintf(os.Stderr, "[API] req=%s "+format+"\n", append([]any{id}, args...)...)
	} else {
		fmt.Fprintf(os.Stderr, "[API] "+format+"\n", args...)
	}
}

// requestIDMiddleware injects a unique request ID into the context and response headers.
func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = newRequestID()
		}
		ctx := context.WithValue(r.Context(), requestIDKey, id)
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// CreateRouter configures the HTTP mux with all API endpoints and middleware.
func CreateRouter(config APIConfig, app *App) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", app.handleHealth)
	mux.HandleFunc("/metrics", app.handleMetrics)

	apiV1 := http.NewServeMux()

	apiV1.HandleFunc("/skills", app.handleSkillsRoot)
	// Any signed-in user may list, install and remove skill repos: a skill is
	// something a person downloads to use with their own agent, and requiring
	// an admin for every one would mean nobody can adopt a skill for their
	// own use case without asking. Still gated by requireSettingsWritable.
	// Known limitation: the repos directory is shared per backend instance
	// (skillsloader.GetSkillReposPath), not per user - fine for the local
	// desktop backend, revisit before exposing one backend to many users.
	apiV1.Handle("/skills/repos", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleSkillRepos))))
	apiV1.Handle("/skills/repos/", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleSkillRepoByNameDispatch))))
	apiV1.Handle("/skills/", app.authMiddleware(http.HandlerFunc(app.handleSkillsDispatch)))

	// Read-only prerequisite check (Docker, the strix CLI, whether the skill
	// repo is installed) for a future dedicated seshat-ui app — no side
	// effects, so authMiddleware is enough, unlike /skills/repos's admin gate.
	apiV1.Handle("/apps/strix/status", app.authMiddleware(http.HandlerFunc(app.handleAppsStrixStatus)))

	apiV1.Handle("/agents", app.authMiddleware(http.HandlerFunc(app.handleAgents)))
	apiV1.Handle("/agents/", app.authMiddleware(http.HandlerFunc(app.handleAgentBySlug)))

	// mcpRoute's reloadsItself flag is checked right here, at the one place
	// every MCP route is registered — see App.mcpRoute's doc comment for why
	// this replaced a per-handler noteMCPToken() call that was easy to
	// forget (and was, in fact, missing from handleMCPTools).
	apiV1.Handle("/mcp", app.mcpRoute(app.handleMCPList, false))
	apiV1.Handle("/mcp/config", app.requireSettingsWritable(app.mcpRoute(app.handleMCPConfig, false)))
	apiV1.Handle("/mcp/config/", app.requireSettingsWritable(app.mcpRoute(app.handleMCPConfigDispatch, false)))
	// /mcp/reload deliberately NOT wrapped: it re-applies configuration
	// that's already saved, it doesn't change it - blocking it would only
	// prevent recovering from a stale runtime state, with no settings-change
	// benefit.
	apiV1.Handle("/mcp/reload", app.mcpRoute(app.handleMCPReload, true))
	apiV1.Handle("/mcp/tools", app.mcpRoute(app.handleMCPTools, false))
	apiV1.Handle("/mcp/org-catalog", app.mcpRoute(app.handleMCPOrgCatalog, false))
	apiV1.Handle("/mcp/org-catalog/", app.requireSettingsWritable(app.mcpRoute(app.handleMCPOrgCatalogApprove, true)))

	apiV1.Handle("/hooks/org-catalog", app.hooksRoute(app.handleHooksOrgCatalog, false))
	apiV1.Handle("/hooks/org-catalog/", app.requireSettingsWritable(app.hooksRoute(app.handleHooksOrgCatalogApprove, true)))

	apiV1.Handle("/query", app.authMiddleware(http.HandlerFunc(app.handleQuery)))
	apiV1.Handle("/transcribe", app.authMiddleware(http.HandlerFunc(app.handleTranscribe)))
	apiV1.Handle("/query/stream", app.authMiddleware(http.HandlerFunc(app.handleQueryStream)))
	apiV1.Handle("/workflows/run", app.authMiddleware(http.HandlerFunc(app.handleWorkflowRun)))

	apiV1.Handle("/permissions/", app.authMiddleware(http.HandlerFunc(app.handlePermissionDecision)))
	apiV1.Handle("/prompts/", app.authMiddleware(http.HandlerFunc(app.handlePromptResponse)))
	apiV1.Handle("/subagents/", app.authMiddleware(http.HandlerFunc(app.handleSubagentCancel)))

	apiV1.Handle("/sessions", app.authMiddleware(http.HandlerFunc(app.handleSessions)))
	apiV1.Handle("/sessions/search", app.authMiddleware(http.HandlerFunc(app.handleSessionSearch)))
	apiV1.Handle("/sessions/", app.authMiddleware(http.HandlerFunc(app.handleSessionByID)))

	apiV1.Handle("/files", app.authMiddleware(http.HandlerFunc(app.handleFiles)))
	apiV1.Handle("/files/", app.authMiddleware(http.HandlerFunc(app.handleFileByID)))

	apiV1.Handle("/artifacts/preview", app.authMiddleware(http.HandlerFunc(app.handleArtifactPreviewCreate)))
	// Deliberately unauthenticated - see handleArtifactPreviewGet's doc comment.
	apiV1.HandleFunc("/artifacts/preview/", app.handleArtifactPreviewGet)

	apiV1.Handle("/corpora", app.authMiddleware(http.HandlerFunc(app.handleCorpora)))
	apiV1.Handle("/corpora/", app.authMiddleware(http.HandlerFunc(app.handleCorpusByID)))
	apiV1.Handle("/knowledge/search", app.authMiddleware(http.HandlerFunc(app.handleKnowledgeSearch)))

	apiV1.Handle("/inbox/accounts", app.authMiddleware(http.HandlerFunc(app.handleInboxAccounts)))
	apiV1.Handle("/inbox/accounts/gmail/oauth/start", app.authMiddleware(http.HandlerFunc(app.handleInboxGmailOAuthStart)))
	// Deliberately unauthenticated - Google's own redirect lands here with no
	// bearer token; see handleInboxGmailOAuthCallback's doc comment.
	apiV1.HandleFunc("/inbox/accounts/gmail/oauth/callback", app.handleInboxGmailOAuthCallback)
	apiV1.Handle("/inbox/accounts/outlook/oauth/start", app.authMiddleware(http.HandlerFunc(app.handleInboxOutlookOAuthStart)))
	// Deliberately unauthenticated - same reasoning as the gmail callback above.
	apiV1.HandleFunc("/inbox/accounts/outlook/oauth/callback", app.handleInboxOutlookOAuthCallback)
	apiV1.Handle("/inbox/accounts/teams/oauth/start", app.authMiddleware(http.HandlerFunc(app.handleInboxTeamsOAuthStart)))
	apiV1.HandleFunc("/inbox/accounts/teams/oauth/callback", app.handleInboxTeamsOAuthCallback)
	apiV1.Handle("/inbox/accounts/whatsapp/pair", app.authMiddleware(http.HandlerFunc(app.handleInboxWhatsAppPair)))
	apiV1.Handle("/inbox/accounts/", app.authMiddleware(http.HandlerFunc(app.handleInboxAccountByID)))
	apiV1.Handle("/inbox/threads", app.authMiddleware(http.HandlerFunc(app.handleInboxThreads)))
	apiV1.Handle("/inbox/threads/", app.authMiddleware(http.HandlerFunc(app.handleInboxThreadByID)))

	apiV1.Handle("/knowledge/connectors/gdrive/accounts", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleKnowledgeGDriveAccounts))))
	apiV1.Handle("/knowledge/connectors/gdrive/accounts/", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleKnowledgeGDriveAccountSync))))
	apiV1.Handle("/knowledge/connectors/gdrive/oauth/start", app.authMiddleware(http.HandlerFunc(app.handleKnowledgeGDriveOAuthStart)))
	// Deliberately unauthenticated - Google's own redirect lands here with no
	// bearer token; see handleKnowledgeGDriveOAuthCallback's doc comment.
	apiV1.HandleFunc("/knowledge/connectors/gdrive/oauth/callback", app.handleKnowledgeGDriveOAuthCallback)

	// SharePoint has no dedicated accounts/sync routes like Drive above -
	// list/delete/sync go through the generic /connectors/sharepoint/...
	// dispatcher below (KnowledgeConnectors["sharepoint"], see
	// bootstrap.go). Only OAuth start/callback need dedicated routes, since
	// the generic dispatcher's POST /connectors/{kind}/accounts is a manual
	// static-token connect, not a full authorization-code flow.
	apiV1.Handle("/knowledge/connectors/sharepoint/oauth/start", app.authMiddleware(http.HandlerFunc(app.handleKnowledgeSharePointOAuthStart)))
	// Deliberately unauthenticated - Microsoft's own redirect lands here
	// with no bearer token; see handleKnowledgeSharePointOAuthCallback's
	// doc comment.
	apiV1.HandleFunc("/knowledge/connectors/sharepoint/oauth/callback", app.handleKnowledgeSharePointOAuthCallback)

	apiV1.Handle("/connectors/", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleConnectorsDispatch))))

	apiV1.Handle("/web/search", app.authMiddleware(http.HandlerFunc(app.handleWebSearch)))
	apiV1.Handle("/web/search/settings", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleWebSearchSettings))))
	apiV1.Handle("/web/search/logs", app.authMiddleware(http.HandlerFunc(app.handleWebSearchLogs)))
	apiV1.Handle("/web/search/providers", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleWebSearchProviders))))
	apiV1.Handle("/web/search/providers/", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleWebSearchProviderByName))))
	apiV1.Handle("/web/search/domain-catalog", app.authMiddleware(http.HandlerFunc(app.handleWebSearchDomainCatalog)))

	apiV1.Handle("/audit/logs", app.authMiddleware(http.HandlerFunc(app.handleAuditLogs)))
	apiV1.Handle("/quotas", app.authMiddleware(http.HandlerFunc(app.handleQuotas)))

	apiV1.Handle("/settings/providers", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleProviderSettings))))
	apiV1.Handle("/settings/providers/", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleProviderSettingByID))))
	apiV1.Handle("/settings/embedder", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleEmbedderConfig))))
	apiV1.Handle("/settings/embedder/", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleEmbedderConfig))))
	apiV1.Handle("/settings/capability-links", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleCapabilityLinks))))
	apiV1.Handle("/settings/capability-links/", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleCapabilityLinks))))
	apiV1.Handle("/settings/document-reader", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleDocumentReaderConfig))))
	apiV1.Handle("/settings/document-reader/", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleDocumentReaderConfig))))
	apiV1.Handle("/settings/reranker", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleRerankerConfig))))
	apiV1.Handle("/settings/reranker/", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleRerankerConfig))))
	apiV1.Handle("/settings/local-stt", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleLocalSTTConfig))))
	apiV1.Handle("/settings/sandbox", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleSandboxConfig))))
	apiV1.Handle("/settings/dataflow-secrets", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleDataflowSecrets))))
	apiV1.Handle("/settings/dataflow-secrets/{name}", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleDataflowSecretByName))))
	apiV1.Handle("/settings/storage", app.requireSettingsWritable(app.authMiddleware(http.HandlerFunc(app.handleStorageConfig))))
	apiV1.Handle("/memories", app.authMiddleware(http.HandlerFunc(app.handleMemories)))
	apiV1.Handle("/memories/", app.authMiddleware(http.HandlerFunc(app.handleMemoryByID)))

	apiV1.Handle("/plans", app.authMiddleware(http.HandlerFunc(app.handlePlans)))
	apiV1.Handle("/plans/", app.authMiddleware(http.HandlerFunc(app.handlePlanByID)))

	// Cloud automation: pairing, plus job management (create/edit/pause/
	// delete/trigger) proxied to seshat-server using the caller's own
	// session token, the same way seshat-console calls it. See
	// helps/seshat-architecture-target.md.
	apiV1.Handle("/automation/status", app.authMiddleware(http.HandlerFunc(app.handleAutomationStatus)))
	apiV1.Handle("/automation/connect", app.authMiddleware(http.HandlerFunc(app.handleAutomationConnect)))
	apiV1.Handle("/automation/register-device", app.authMiddleware(http.HandlerFunc(app.handleAutomationRegisterDevice)))
	apiV1.Handle("/automation/disconnect", app.authMiddleware(http.HandlerFunc(app.handleAutomationDisconnect)))
	apiV1.Handle("/automation/runs", app.authMiddleware(http.HandlerFunc(app.handleAutomationRuns)))
	apiV1.Handle("/automation/devices", app.authMiddleware(http.HandlerFunc(app.handleAutomationDevices)))
	apiV1.Handle("/automation/jobs", app.authMiddleware(http.HandlerFunc(app.handleAutomationJobs)))
	// Registered as an exact pattern so it wins over the "/automation/jobs/"
	// subtree pattern below (ServeMux picks the more specific match
	// regardless of registration order) instead of falling into
	// handleAutomationJobDispatch, which would otherwise treat "draft" as a
	// job id.
	apiV1.Handle("/automation/jobs/draft", app.authMiddleware(http.HandlerFunc(app.handleAutomationJobDraft)))
	apiV1.Handle("/automation/jobs/", app.authMiddleware(http.HandlerFunc(app.handleAutomationJobDispatch)))
	apiV1.Handle("/automation/dataflow/node-types", app.authMiddleware(http.HandlerFunc(app.handleAutomationDataflowNodeTypes)))
	apiV1.Handle("/automation/dataflow/templates", app.authMiddleware(http.HandlerFunc(app.handleAutomationDataflowTemplates)))
	apiV1.Handle("/automation/overview", app.authMiddleware(http.HandlerFunc(app.handleAutomationOverview)))
	apiV1.Handle("/automation/variables", app.authMiddleware(http.HandlerFunc(app.handleAutomationVariables)))
	apiV1.Handle("/automation/variables/", app.authMiddleware(http.HandlerFunc(app.handleAutomationVariableDispatch)))
	apiV1.Handle("/automation/dataflow/preview-expression", app.authMiddleware(http.HandlerFunc(app.handleAutomationDataflowPreviewExpression)))
	apiV1.Handle("/automation/dataflow/test-connection", app.authMiddleware(http.HandlerFunc(app.handleAutomationDataflowTestConnection)))
	apiV1.Handle("/automation/dataflow/test-run", app.authMiddleware(http.HandlerFunc(app.handleAutomationDataflowTestRun)))
	apiV1.Handle("/automation/dataflow-secrets", app.authMiddleware(http.HandlerFunc(app.handleAutomationDataflowSecrets)))
	apiV1.Handle("/automation/dataflow-secrets/", app.authMiddleware(http.HandlerFunc(app.handleAutomationDataflowSecretDispatch)))
	apiV1.Handle("/admin/provider-settings", app.authMiddleware(http.HandlerFunc(app.handleAdminProviderSettings)))
	apiV1.Handle("/admin/provider-settings/", app.authMiddleware(http.HandlerFunc(app.handleAdminProviderSettingDispatch)))
	apiV1.Handle("/admin/connector-oauth-apps", app.authMiddleware(http.HandlerFunc(app.handleAdminConnectorOAuthApps)))
	apiV1.Handle("/admin/connector-oauth-apps/", app.authMiddleware(http.HandlerFunc(app.handleAdminConnectorOAuthAppByKind)))
	apiV1.Handle("/admin/mcp-server-configs", app.authMiddleware(http.HandlerFunc(app.handleAdminMCPServerConfigs)))
	apiV1.Handle("/admin/mcp-server-configs/", app.authMiddleware(http.HandlerFunc(app.handleAdminMCPServerConfigDispatch)))
	apiV1.Handle("/admin/web-search-org-policy", app.authMiddleware(http.HandlerFunc(app.handleAdminWebSearchOrgPolicy)))
	apiV1.Handle("/admin/teams", app.authMiddleware(http.HandlerFunc(app.handleAdminTeams)))
	apiV1.Handle("/admin/teams/", app.authMiddleware(http.HandlerFunc(app.handleAdminTeamDispatch)))
	apiV1.Handle("/admin/memberships", app.authMiddleware(http.HandlerFunc(app.handleAdminMemberships)))
	apiV1.Handle("/admin/memberships/", app.authMiddleware(http.HandlerFunc(app.handleAdminMembershipDispatch)))
	apiV1.Handle("/admin/roles", app.authMiddleware(http.HandlerFunc(app.handleAdminRoles)))
	apiV1.Handle("/admin/invitations", app.authMiddleware(http.HandlerFunc(app.handleAdminInvitations)))
	apiV1.Handle("/admin/invitations/", app.authMiddleware(http.HandlerFunc(app.handleAdminInvitationRevoke)))
	apiV1.Handle("/admin/desktop-policies/catalog", app.authMiddleware(http.HandlerFunc(app.handleAdminDesktopPolicyCatalog)))
	apiV1.Handle("/admin/desktop-policy-bindings", app.authMiddleware(http.HandlerFunc(app.handleAdminDesktopPolicyBindings)))
	apiV1.Handle("/admin/desktop-policy-bindings/", app.authMiddleware(http.HandlerFunc(app.handleAdminDesktopPolicyBindingDispatch)))
	apiV1.Handle("/admin/agent-presets", app.authMiddleware(http.HandlerFunc(app.handleAdminAgentPresets)))
	apiV1.Handle("/admin/agent-presets/", app.authMiddleware(http.HandlerFunc(app.handleAdminAgentPresetDispatch)))

	// Public: needed by the Login/Register screens before any session exists.
	apiV1.HandleFunc("/system/status", app.handleSystemStatus)
	apiV1.Handle("/system/network-diagnostics", app.authMiddleware(http.HandlerFunc(app.handleNetworkDiagnostics)))

	apiV1.Handle("/models", app.authMiddleware(http.HandlerFunc(handleModelsList)))
	apiV1.HandleFunc("/metrics", app.handleMetricsJSON)
	apiV1.HandleFunc("/desktop/handshake", app.handleDesktopHandshake)

	apiV1.HandleFunc("/auth/login", app.handleLogin)
	apiV1.HandleFunc("/auth/register", app.handleRegister)
	apiV1.Handle("/auth/logout", app.authMiddleware(http.HandlerFunc(app.handleLogout)))
	apiV1.Handle("/auth/me", app.authMiddleware(http.HandlerFunc(app.handleMe)))
	apiV1.Handle("/auth/admin/ping", app.requireRole("admin", http.HandlerFunc(app.handleAdminPing)))

	apiV1.Handle("/users", app.authMiddleware(http.HandlerFunc(app.handleListOrCreateUsers)))
	apiV1.Handle("/users/me", app.authMiddleware(http.HandlerFunc(app.handleUserMe)))
	apiV1.Handle("/users/me/settings", app.authMiddleware(http.HandlerFunc(app.handleUserMeSettings)))
	apiV1.Handle("/users/me/api-keys", app.authMiddleware(http.HandlerFunc(app.handleUserMeAPIKeys)))
	apiV1.Handle("/users/me/api-keys/", app.authMiddleware(http.HandlerFunc(app.handleUserMeAPIKeyByID)))
	apiV1.Handle("/users/me/preferences", app.authMiddleware(http.HandlerFunc(app.handleUserPreferences)))
	apiV1.Handle("/users/", app.authMiddleware(http.HandlerFunc(app.handleUserByID)))

	// Fully reachable in standalone/local mode too, on a single-user install's
	// own "Default Organization"/"Main Workspace" — see the doc comment above
	// Organization/Workspace/WorkspaceMembership in internal/db/tenancy.go for
	// why that schema exists locally at all.
	apiV1.Handle("/organizations", app.authMiddleware(http.HandlerFunc(app.handleOrganizations)))
	apiV1.Handle("/organizations/", app.authMiddleware(http.HandlerFunc(app.handleOrganizationByID)))
	apiV1.Handle("/workspaces", app.authMiddleware(http.HandlerFunc(app.handleWorkspaces)))
	apiV1.Handle("/workspaces/", app.authMiddleware(http.HandlerFunc(app.handleWorkspaceByID)))

	var handler http.Handler = apiV1
	handler = maxBodyMiddleware(4<<20, handler) // 4 MB — prevents oversized JSON body attacks
	if config.EnableCORS {
		if len(config.AllowedOrigins) == 0 {
			log.Printf("[warn] CORS enabled without an explicit AllowedOrigins allowlist — defaulting to any localhost origin (any port). Set AllowedOrigins in config for production use.")
		}
		handler = corsMiddleware(config.AllowedOrigins, handler)
	}
	handler = recoverMiddleware(handler)
	handler = requestIDMiddleware(handler)
	handler = otelhttp.NewHandler(handler, "seshat-api",
		otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
			return r.Method + " " + r.URL.Path
		}),
	)

	mux.Handle("/api/v1/", http.StripPrefix("/api/v1", handler))

	// Registered directly on mux (a more specific pattern than "/api/v1/",
	// so Go's ServeMux routes it here first) instead of on apiV1 - it needs
	// to reach the real *http.response the Go server handed us so the
	// websocket upgrade below can type-assert it as http.Hijacker.
	// otelhttp.NewHandler's own response wrapper doesn't implement Hijacker
	// (see its resp_writer_wrapper.go, a documented gap in that library),
	// and neither does recoverMiddleware's commitTrackingWriter - stacking
	// either of those in front of this handler breaks every websocket
	// upgrade with "response does not implement http.Hijacker". Still
	// behind authMiddleware (auth doesn't touch the ResponseWriter) since
	// this still needs the same Bearer-token check as everything else.
	mux.Handle("/api/v1/terminal/ws/", http.StripPrefix("/api/v1", app.authMiddleware(http.HandlerFunc(app.handleTerminalWS))))

	// Anthropic Messages API compatible prefix.
	// Clients set ANTHROPIC_BASE_URL=http://<host>/v1 to route through Seshat.
	// Auth: x-api-key: <seshat-key>  or  Authorization: Bearer <seshat-jwt>
	v1compat := http.NewServeMux()
	v1compat.Handle("/messages", app.anthropicAuthMiddleware(http.HandlerFunc(app.handleMessages)))

	var compatHandler http.Handler = v1compat
	if config.EnableCORS {
		compatHandler = corsMiddleware(config.AllowedOrigins, compatHandler)
	}
	compatHandler = recoverMiddleware(compatHandler)
	compatHandler = requestIDMiddleware(compatHandler)

	mux.Handle("/v1/", http.StripPrefix("/v1", compatHandler))

	return mux
}

// commitTrackingWriter wraps a ResponseWriter to record whether a response has
// already been started (headers written or body bytes flushed). recoverMiddleware
// uses this to tell an early panic (safe to answer with a normal JSON error) apart
// from a panic mid-stream, where the client has already received a 200 and
// SSE framing has begun — see recoverMiddleware for why that distinction matters.
type commitTrackingWriter struct {
	http.ResponseWriter
	committed bool
}

func (w *commitTrackingWriter) WriteHeader(status int) {
	w.committed = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *commitTrackingWriter) Write(b []byte) (int, error) {
	w.committed = true
	return w.ResponseWriter.Write(b)
}

// Flush lets streaming handlers (SSE) keep using this writer as an http.Flusher —
// without this, wrapping w here would silently break flushing for every handler.
func (w *commitTrackingWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// recoverMiddleware catches panics in handlers and returns a 500 instead of crashing the process.
//
// If the panic happens before the response was committed, it answers with a normal
// JSON error body. If it happens after (e.g. partway through an SSE stream, once
// headers and possibly several events have already been flushed to the client),
// calling WriteHeader/writeJSONError here would be a silent no-op for the status
// line and would instead splice a bare, non-SSE-framed JSON object into the
// half-open stream — which the client can't tell apart from a corrupted or
// truncated connection. In that case it writes a protocol-conformant
// `event: error` SSE frame instead, matching the contract documented in
// query_sse.go, so streaming clients can detect and report the failure cleanly.
func recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cw := &commitTrackingWriter{ResponseWriter: w}
		defer func() {
			if rec := recover(); rec != nil {
				logError(r, "panic recovered: %v\n%s", rec, debug.Stack())
				if cw.committed {
					fmt.Fprintf(cw, "event: error\ndata: {\"error\":\"internal server error\"}\n\n")
					cw.Flush()
					return
				}
				writeJSONError(cw, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(cw, r)
	})
}

// corsMiddleware adds CORS headers. When allowedOrigins is non-empty, only those origins are
// allowed; otherwise it defaults to localhost (port-agnostic) for local dev.
func corsMiddleware(allowedOrigins []string, next http.Handler) http.Handler {
	// Build a fast-lookup set.
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[strings.TrimRight(o, "/")] = true
	}

	isAllowed := func(origin string) bool {
		if len(allowed) == 0 {
			// Default: accept any localhost origin (127.0.0.1 or localhost, any
			// port), deliberately, not just an oversight left unconfigured.
			// seshat-ui's renderer talks to this API two ways: through the
			// Electron main-process IPC bridge (not subject to CORS at all —
			// it's not a browser fetch), or directly via browser fetch when
			// window.nexus is unavailable ("browser dev mode", explicitly
			// supported per seshat-ui/AGENTS.md) — that second path runs on
			// an arbitrary Vite dev-server port that isn't known ahead of
			// time, so pinning a single allowed origin by default would break
			// it on every port change.
			//
			// This is safe to leave permissive because auth here is a Bearer
			// token attached explicitly by the client, not a cookie the
			// browser attaches automatically — CORS's main purpose (stopping
			// a malicious page from riding the victim's ambient cookie/session)
			// doesn't apply: a page on another origin has no way to obtain
			// this app's token to put in an Authorization header, permissive
			// CORS or not. Set AllowedOrigins explicitly for any deployment
			// where the API is reachable by more than just this instance's
			// own local UI (see the startup warning logged when it's unset).
			return strings.HasPrefix(origin, "http://localhost:") ||
				strings.HasPrefix(origin, "http://127.0.0.1:") ||
				origin == "http://localhost" ||
				origin == "http://127.0.0.1"
		}
		return allowed[origin]
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && isAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// maxBodyMiddleware limits request body size for all endpoints except SSE streams and file uploads.
func maxBodyMiddleware(maxBytes int64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/stream") || strings.Contains(path, "/files") || strings.Contains(path, "/ingest") {
			next.ServeHTTP(w, r)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		next.ServeHTTP(w, r)
	})
}
