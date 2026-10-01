package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
)

type connectManualAccountRequest struct {
	DisplayName       string `json:"display_name"`
	ExternalAccountID string `json:"external_account_id"`
	AccessToken       string `json:"access_token"`
	// RefreshToken/Config are optional, for connector kinds whose auth
	// shape needs more than one static token - e.g. s3 stores the
	// S3 secret access key here and non-secret bucket/region/endpoint
	// config in Config (JSON-encoded into ConnectorAccount.Scope). A
	// single-token connector like mcp/action's simply leaves both empty.
	RefreshToken string         `json:"refresh_token"`
	Config       map[string]any `json:"config"`
}

// handleConnectorsDispatch handles every /connectors/{kind}/... route.
// Registered as a single prefix (mirroring handleSkillsDispatch's pattern
// in skills_manage.go, this codebase's established convention for
// path-segment routing rather than Go 1.22 {param} mux patterns) since
// {kind} sits in the middle of the path:
//   - GET/POST /connectors/{kind}/accounts              -> handleConnectorAccounts
//   - DELETE   /connectors/{kind}/accounts/{id}          -> handleConnectorAccountDelete
//   - POST     /connectors/{kind}/accounts/{id}/act      -> handleConnectorAccountAct
//   - POST     /connectors/{kind}/accounts/{id}/sync     -> handleConnectorAccountSync
//
// The /sync case is s3's route, deliberately generic rather than
// a dedicated /knowledge/connectors/s3/... pair like Drive's - see
// helps/roadmap.md Phase 3 for why Drive's existing routes aren't migrated
// to match (working, low-value refactor) while S3 starts on the generic
// path from day one. GET/DELETE were added alongside the Settings
// connector catalog (same phase) - Drive keeps using its own dedicated
// GET .../gdrive/accounts, but DELETE is only ever this generic route,
// even for Drive accounts: ConnectorAccountStore.Delete is already
// kind-agnostic, so there was nothing Drive-specific to build.
//
// Also dispatches Workspace → Connections' self-service routes
// (connectors_myaccounts.go) - a second, unrelated system (a cloud
// forward to seshat-server's connectors.Service, vs. this file's own local
// ConnectorAccounts store) that happens to need the same /connectors/
// prefix, since only one handler can own it in this router:
//   - GET    /connectors/my-accounts             -> handleMyConnectorAccounts
//   - DELETE /connectors/my-accounts/{id}         -> handleMyConnectorAccountByID
//   - POST   /connectors/{kind}/oauth/start       -> handleConnectorOAuthStart
//   - POST   /connectors/{kind}/static-account    -> handleConnectorStaticAccount
//
// "my-accounts" is never a real connector kind (checked against
// @seshat/connector-catalog's full list), so checking for it ahead of the
// kind-based cases below is unambiguous.
func (a *App) handleConnectorsDispatch(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.Trim(strings.TrimPrefix(r.URL.Path, "/connectors/"), "/")
	parts := strings.Split(trimmed, "/")
	kind := parts[0]

	switch {
	case trimmed == "my-accounts":
		a.handleMyConnectorAccounts(w, r)
	case len(parts) == 2 && parts[0] == "my-accounts":
		a.handleMyConnectorAccountByID(w, r, parts[1])
	case len(parts) == 3 && parts[1] == "oauth" && parts[2] == "start":
		a.handleConnectorOAuthStart(w, r, kind)
	case len(parts) == 2 && parts[1] == "static-account":
		a.handleConnectorStaticAccount(w, r, kind)
	case len(parts) == 2 && parts[1] == "accounts":
		a.handleConnectorAccounts(w, r, kind)
	case len(parts) == 3 && parts[1] == "accounts":
		a.handleConnectorAccountDelete(w, r, kind, parts[2])
	case len(parts) == 4 && parts[1] == "accounts" && parts[3] == "act":
		a.handleConnectorAccountAct(w, r, kind, parts[2])
	case len(parts) == 4 && parts[1] == "accounts" && parts[3] == "sync":
		a.handleConnectorAccountSync(w, r, kind, parts[2])
	default:
		writeJSONError(w, http.StatusNotFound, "not found")
	}
}

// handleConnectorAccounts handles GET/POST /connectors/{kind}/accounts.
// GET lists the caller's own accounts of this kind - the read side needed
// by the Settings connector catalog (helps/roadmap.md Phase 3). POST is
// manual (non-OAuth) account connection: the caller already has a static
// credential (an API key/bearer token, as most MCP servers use) rather
// than an authorization-code flow to run. Distinct from Drive/Gmail's
// OAuth start/callback pair, which this deliberately does not replicate -
// see internal/mcp/action's doc comment for why a static token fits an
// MCP-backed ActionConnector's actual auth shape.
func (a *App) handleConnectorAccounts(w http.ResponseWriter, r *http.Request, kind string) {
	if a.backend.ConnectorAccounts == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "connector accounts are not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if kind == "" {
		writeJSONError(w, http.StatusBadRequest, "kind is required")
		return
	}

	if r.Method == http.MethodGet {
		all, err := a.backend.ConnectorAccounts.ListByUserID(r.Context(), principal.User.ID)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		items := make([]connectorAccountResponse, 0, len(all))
		for _, acc := range all {
			if acc.Kind == kind {
				items = append(items, connectorAccountToResponse(acc))
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"accounts": items, "count": len(items)})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req connectManualAccountRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.AccessToken) == "" {
		writeJSONError(w, http.StatusBadRequest, "access_token is required")
		return
	}
	scope := ""
	if len(req.Config) > 0 {
		encoded, err := json.Marshal(req.Config)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid config: "+err.Error())
			return
		}
		scope = string(encoded)
	}

	accounts := a.backend.ConnectorAccounts
	record, err := accounts.Create(r.Context(), db.CreateConnectorAccountParams{
		UserID:            principal.User.ID,
		Kind:              kind,
		DisplayName:       req.DisplayName,
		ExternalAccountID: req.ExternalAccountID,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create connector account: "+err.Error())
		return
	}
	if _, err := accounts.UpdateConnected(r.Context(), db.UpdateConnectorAccountConnectedParams{
		ID:                record.ID,
		DisplayName:       req.DisplayName,
		ExternalAccountID: req.ExternalAccountID,
		AccessToken:       req.AccessToken,
		RefreshToken:      req.RefreshToken,
		Scope:             scope,
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to save connector credentials: "+err.Error())
		return
	}
	updated, err := accounts.GetByID(r.Context(), record.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, connectorAccountToResponse(*updated))
}

// handleConnectorAccountDelete handles
// DELETE /connectors/{kind}/accounts/{accountID} - disconnects any
// connector account regardless of kind (including Drive's, which has no
// dedicated delete route of its own - ConnectorAccountStore.Delete was
// already kind-agnostic, so this one route covers every connector).
func (a *App) handleConnectorAccountDelete(w http.ResponseWriter, r *http.Request, kind, accountID string) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if a.backend.ConnectorAccounts == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "connector accounts are not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if kind == "" || accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "kind and account id are required")
		return
	}

	accounts := a.backend.ConnectorAccounts
	account, err := accounts.GetByID(r.Context(), accountID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "connector account not found")
		return
	}
	if account.UserID != principal.User.ID {
		writeJSONError(w, http.StatusForbidden, "connector account belongs to another user")
		return
	}
	if account.Kind != kind {
		writeJSONError(w, http.StatusNotFound, "connector account not found")
		return
	}
	if err := accounts.Delete(r.Context(), accountID); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to disconnect: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type actRequest struct {
	Action  string         `json:"action"`
	Payload map[string]any `json:"payload"`
}

// handleConnectorAccountAct handles
// POST /connectors/{kind}/accounts/{accountID}/act - the Action-connector
// counterpart of Drive's manual sync trigger
// (handleKnowledgeGDriveAccountSync): a single deterministic call to
// connector.ActionConnector.Act, symmetric with how Sync is triggered for
// a KnowledgeConnector.
func (a *App) handleConnectorAccountAct(w http.ResponseWriter, r *http.Request, kind, accountID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if a.backend.ConnectorAccounts == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "connector accounts are not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if kind == "" || accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "kind and account id are required")
		return
	}
	actionConnector, ok := a.backend.ActionConnectors[kind]
	if !ok {
		writeJSONError(w, http.StatusNotFound, "no action connector configured for kind "+kind)
		return
	}

	var req actRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Action) == "" {
		writeJSONError(w, http.StatusBadRequest, "action is required")
		return
	}

	accounts := a.backend.ConnectorAccounts
	account, err := accounts.GetByID(r.Context(), accountID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "connector account not found")
		return
	}
	if account.UserID != principal.User.ID {
		writeJSONError(w, http.StatusForbidden, "connector account belongs to another user")
		return
	}
	secret, err := accounts.GetSecret(r.Context(), accountID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to load connector credentials")
		return
	}

	result, err := actionConnector.Act(r.Context(), connector.Account{
		ID:     account.ID,
		UserID: account.UserID,
		Status: account.Status,
		Config: account.Scope,
	}, connector.Secret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		ExpiresAt:    secret.ExpiresAt,
	}, req.Action, req.Payload)
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "action failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleConnectorAccountSync handles
// POST /connectors/{kind}/accounts/{accountID}/sync?corpus_id=... - the
// generic counterpart of handleKnowledgeGDriveAccountSync (gdrive.go),
// resolving the target connector.KnowledgeConnector by kind from
// a.backend.KnowledgeConnectors instead of a dedicated field. Same steps:
// load the account, verify ownership, load the secret, Sync, IngestExternal
// each item, persist the new cursor.
func (a *App) handleConnectorAccountSync(w http.ResponseWriter, r *http.Request, kind, accountID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if a.backend.ConnectorAccounts == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "connector accounts are not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if kind == "" || accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "kind and account id are required")
		return
	}
	knowledgeConnector, ok := a.backend.KnowledgeConnectors[kind]
	if !ok {
		writeJSONError(w, http.StatusNotFound, "no knowledge connector configured for kind "+kind)
		return
	}
	// IngestExternal is only available on the local knowledge.Service, not
	// the knowledge.Backend interface (connected mode's RemoteService also
	// implements it) - same limitation as Drive's sync handler, connector-
	// driven ingestion is out of scope for connected mode in this phase.
	knowledgeSvc, ok := a.backend.Knowledge.(*knowledge.Service)
	if !ok {
		writeJSONError(w, http.StatusNotImplemented, "connector sync is not supported in connected mode yet")
		return
	}
	corpusID := r.URL.Query().Get("corpus_id")
	if corpusID == "" {
		writeJSONError(w, http.StatusBadRequest, "corpus_id query parameter is required")
		return
	}

	accounts := a.backend.ConnectorAccounts
	account, err := accounts.GetByID(r.Context(), accountID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "connector account not found")
		return
	}
	if account.UserID != principal.User.ID {
		writeJSONError(w, http.StatusForbidden, "connector account belongs to another user")
		return
	}
	secret, err := accounts.GetSecret(r.Context(), accountID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to load connector credentials")
		return
	}

	items, nextCursor, err := knowledgeConnector.Sync(r.Context(), connector.Account{
		ID:     account.ID,
		UserID: account.UserID,
		Status: account.Status,
		Config: account.Scope,
	}, connector.Secret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		ExpiresAt:    secret.ExpiresAt,
	}, account.SyncCursor)
	if err != nil {
		_ = accounts.UpdateSyncState(r.Context(), db.UpdateConnectorAccountSyncParams{
			ID: accountID, SyncCursor: account.SyncCursor, LastSyncedAt: time.Now(), LastError: err.Error(),
		})
		writeJSONError(w, http.StatusBadGateway, "sync failed: "+err.Error())
		return
	}

	ingested := 0
	for _, item := range items {
		acl := make([]string, 0, len(item.AccessControl))
		for _, entry := range item.AccessControl {
			acl = append(acl, string(entry))
		}
		_, err := knowledgeSvc.IngestExternal(r.Context(), principal, knowledge.ExternalIngestParams{
			CorpusID:      corpusID,
			ExternalID:    kind + "-" + item.ID,
			Filename:      item.Name,
			Text:          item.Text,
			AccessControl: acl,
		})
		if err == nil {
			ingested++
		}
	}

	_ = accounts.UpdateSyncState(r.Context(), db.UpdateConnectorAccountSyncParams{
		ID: accountID, SyncCursor: nextCursor, LastSyncedAt: time.Now(),
	})
	writeJSON(w, http.StatusOK, map[string]any{"synced_items": len(items), "ingested": ingested})
}
