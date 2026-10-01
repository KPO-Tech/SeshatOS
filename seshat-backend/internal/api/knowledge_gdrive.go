package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/gdrive"
	"golang.org/x/oauth2"
)

type connectorAccountResponse struct {
	ID                string `json:"id"`
	Kind              string `json:"kind"`
	DisplayName       string `json:"display_name"`
	ExternalAccountID string `json:"external_account_id"`
	Status            string `json:"status"`
	LastSyncedAt      int64  `json:"last_synced_at,omitempty"`
	LastError         string `json:"last_error,omitempty"`
	CreatedAt         int64  `json:"created_at"`
}

func connectorAccountToResponse(a db.ConnectorAccount) connectorAccountResponse {
	resp := connectorAccountResponse{
		ID:                a.ID,
		Kind:              a.Kind,
		DisplayName:       a.DisplayName,
		ExternalAccountID: a.ExternalAccountID,
		Status:            a.Status,
		LastError:         a.LastError,
		CreatedAt:         a.CreatedAt.Unix(),
	}
	if !a.LastSyncedAt.IsZero() {
		resp.LastSyncedAt = a.LastSyncedAt.Unix()
	}
	return resp
}

// handleKnowledgeGDriveAccounts handles GET /knowledge/connectors/gdrive/accounts
func (a *App) handleKnowledgeGDriveAccounts(w http.ResponseWriter, r *http.Request) {
	if a.backend.KnowledgeGDriveAccounts == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "google drive connector is not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	accounts, err := a.backend.KnowledgeGDriveAccounts.ListByUserID(r.Context(), principal.User.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	items := make([]connectorAccountResponse, 0, len(accounts))
	for _, acc := range accounts {
		items = append(items, connectorAccountToResponse(acc))
	}
	writeJSON(w, http.StatusOK, map[string]any{"accounts": items, "count": len(items)})
}

// handleKnowledgeGDriveOAuthStart handles POST /knowledge/connectors/gdrive/oauth/start
// - same shape as handleInboxGmailOAuthStart, see its doc comment.
func (a *App) handleKnowledgeGDriveOAuthStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	cfg, err := gdrive.BaseOAuthConfig()
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	state, err := randomState()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to generate oauth state")
		return
	}
	a.storeOAuthState(state, principal.User.ID)

	cfgCopy := *cfg
	cfgCopy.RedirectURL = knowledgeGDriveCallbackURL(r)
	authURL := cfgCopy.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"))
	writeJSON(w, http.StatusOK, map[string]any{"authorization_url": authURL})
}

// handleKnowledgeGDriveOAuthCallback handles GET /knowledge/connectors/gdrive/oauth/callback
// - see handleInboxGmailOAuthCallback's doc comment for why this is
// unauthenticated (Google's redirect carries no bearer token) and relies on
// the signed state issued in handleKnowledgeGDriveOAuthStart instead.
func (a *App) handleKnowledgeGDriveOAuthCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	query := r.URL.Query()
	if errMsg := query.Get("error"); errMsg != "" {
		writeOAuthResultPage(w, false, "Google reported an error: "+errMsg)
		return
	}
	code := query.Get("code")
	state := query.Get("state")
	if code == "" || state == "" {
		writeOAuthResultPage(w, false, "Missing authorization code or state.")
		return
	}
	userID, ok := a.takeOAuthState(state)
	if !ok {
		writeOAuthResultPage(w, false, "This authorization link has expired or was already used - please try connecting again.")
		return
	}
	if a.backend.KnowledgeGDriveAccounts == nil {
		writeOAuthResultPage(w, false, "Google Drive connector is not configured on this server.")
		return
	}

	cfg, err := gdrive.BaseOAuthConfig()
	if err != nil {
		writeOAuthResultPage(w, false, err.Error())
		return
	}
	cfg.RedirectURL = knowledgeGDriveCallbackURL(r)

	token, err := cfg.Exchange(r.Context(), code)
	if err != nil {
		writeOAuthResultPage(w, false, "Failed to exchange authorization code: "+err.Error())
		return
	}
	email, err := fetchGoogleAccountEmail(r.Context(), cfg, token)
	if err != nil {
		writeOAuthResultPage(w, false, "Connected to Google, but could not read the account email: "+err.Error())
		return
	}

	// Reconnecting an already-known account (same user + external email)
	// must update that account in place, not create a second row - mirrors
	// inbox.Service.ConnectAccount's find-or-create.
	accounts := a.backend.KnowledgeGDriveAccounts
	recordID := ""
	if existing, found, lookupErr := accounts.GetByKindAndExternalID(r.Context(), userID, string(gdrive.Kind), email); lookupErr != nil {
		writeOAuthResultPage(w, false, "Failed to look up existing connector account: "+lookupErr.Error())
		return
	} else if found {
		recordID = existing.ID
	} else {
		record, createErr := accounts.Create(r.Context(), db.CreateConnectorAccountParams{
			UserID:            userID,
			Kind:              string(gdrive.Kind),
			DisplayName:       email,
			ExternalAccountID: email,
		})
		if createErr != nil {
			writeOAuthResultPage(w, false, "Failed to create connector account: "+createErr.Error())
			return
		}
		recordID = record.ID
	}

	if _, err := accounts.UpdateConnected(r.Context(), db.UpdateConnectorAccountConnectedParams{
		ID:                recordID,
		DisplayName:       email,
		ExternalAccountID: email,
		AccessToken:       token.AccessToken,
		RefreshToken:      token.RefreshToken,
		Scope:             strings.Join(gdrive.Scopes, " "),
		ExpiresAt:         token.Expiry,
	}); err != nil {
		writeOAuthResultPage(w, false, "Failed to save the connected account: "+err.Error())
		return
	}
	writeOAuthResultPage(w, true, fmt.Sprintf("Connected %s. You can close this tab and return to Seshat.", email))
}

// handleKnowledgeGDriveAccountSync handles
// POST /knowledge/connectors/gdrive/accounts/{id}/sync?corpus_id={corpusID}
// - manual trigger only for this first version (see helps/roadmap.md Phase
// 1): Discover+Sync the connected Drive account, then IngestExternal each
// synced item into the given corpus.
func (a *App) handleKnowledgeGDriveAccountSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if a.backend.KnowledgeGDriveAccounts == nil || a.backend.KnowledgeGDrive == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "google drive connector is not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// IngestExternal is only available on the local knowledge.Service, not
	// the knowledge.Backend interface (which connected mode's RemoteService
	// also implements) - connector-driven ingestion is out of scope for
	// connected mode in this phase, see roadmap.md.
	knowledgeSvc, ok := a.backend.Knowledge.(*knowledge.Service)
	if !ok {
		writeJSONError(w, http.StatusNotImplemented, "google drive sync is not supported in connected mode yet")
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/knowledge/connectors/gdrive/accounts/")
	rest = strings.TrimSuffix(strings.Trim(rest, "/"), "/sync")
	accountID := rest
	if accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "account id is required")
		return
	}
	corpusID := r.URL.Query().Get("corpus_id")
	if corpusID == "" {
		writeJSONError(w, http.StatusBadRequest, "corpus_id query parameter is required")
		return
	}

	account, err := a.backend.KnowledgeGDriveAccounts.GetByID(r.Context(), accountID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "connector account not found")
		return
	}
	if account.UserID != principal.User.ID {
		writeJSONError(w, http.StatusForbidden, "connector account belongs to another user")
		return
	}
	secret, err := a.backend.KnowledgeGDriveAccounts.GetSecret(r.Context(), accountID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to load connector credentials")
		return
	}

	items, nextCursor, err := a.backend.KnowledgeGDrive.Sync(r.Context(), connector.Account{
		ID:     account.ID,
		UserID: account.UserID,
		Status: account.Status,
	}, connector.Secret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		ExpiresAt:    secret.ExpiresAt,
	}, account.SyncCursor)
	if err != nil {
		_ = a.backend.KnowledgeGDriveAccounts.UpdateSyncState(r.Context(), db.UpdateConnectorAccountSyncParams{
			ID: accountID, SyncCursor: account.SyncCursor, LastSyncedAt: time.Now(), LastError: err.Error(),
		})
		writeJSONError(w, http.StatusBadGateway, "drive sync failed: "+err.Error())
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
			ExternalID:    "gdrive-" + item.ID,
			Filename:      item.Name,
			Text:          item.Text,
			AccessControl: acl,
		})
		if err == nil {
			ingested++
		}
	}

	_ = a.backend.KnowledgeGDriveAccounts.UpdateSyncState(r.Context(), db.UpdateConnectorAccountSyncParams{
		ID: accountID, SyncCursor: nextCursor, LastSyncedAt: time.Now(),
	})
	writeJSON(w, http.StatusOK, map[string]any{"synced_items": len(items), "ingested": ingested})
}

// knowledgeGDriveCallbackURL derives the redirect URI from the incoming
// request's own host:port - see gmailCallbackURL's doc comment (inbox.go)
// for why.
func knowledgeGDriveCallbackURL(r *http.Request) string {
	return fmt.Sprintf("http://%s/api/v1/knowledge/connectors/gdrive/oauth/callback", r.Host)
}
