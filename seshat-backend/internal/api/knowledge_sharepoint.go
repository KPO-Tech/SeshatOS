package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"golang.org/x/oauth2"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/sharepoint"
)

// handleKnowledgeSharePointOAuthStart handles
// POST /knowledge/connectors/sharepoint/oauth/start. Unlike Drive/Gmail,
// this must generate a PKCE code verifier (Microsoft's public/native
// client model requires it in place of a client secret — see
// internal/oauth/microsoft's package doc comment) and carry it across the
// redirect round trip via storeOAuthStateWithVerifier.
func (a *App) handleKnowledgeSharePointOAuthStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	cfg, err := sharepoint.BaseOAuthConfig()
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, err.Error())
		return
	}

	state, err := randomState()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to generate oauth state")
		return
	}
	verifier := oauth2.GenerateVerifier()
	a.storeOAuthStateWithVerifier(state, principal.User.ID, verifier)

	cfgCopy := *cfg
	cfgCopy.RedirectURL = knowledgeSharePointCallbackURL(r)
	authURL := cfgCopy.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier))
	writeJSON(w, http.StatusOK, map[string]any{"authorization_url": authURL})
}

// handleKnowledgeSharePointOAuthCallback handles
// GET /knowledge/connectors/sharepoint/oauth/callback — see
// handleKnowledgeGDriveOAuthCallback's doc comment for why this is
// unauthenticated and relies on the signed state issued in
// handleKnowledgeSharePointOAuthStart instead.
func (a *App) handleKnowledgeSharePointOAuthCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	query := r.URL.Query()
	if errMsg := query.Get("error"); errMsg != "" {
		writeOAuthResultPage(w, false, "Microsoft reported an error: "+errMsg)
		return
	}
	code := query.Get("code")
	state := query.Get("state")
	if code == "" || state == "" {
		writeOAuthResultPage(w, false, "Missing authorization code or state.")
		return
	}
	userID, verifier, ok := a.takeOAuthStateWithVerifier(state)
	if !ok {
		writeOAuthResultPage(w, false, "This authorization link has expired or was already used - please try connecting again.")
		return
	}
	if a.backend.ConnectorAccounts == nil {
		writeOAuthResultPage(w, false, "SharePoint connector is not configured on this server.")
		return
	}

	cfg, err := sharepoint.BaseOAuthConfig()
	if err != nil {
		writeOAuthResultPage(w, false, err.Error())
		return
	}
	cfg.RedirectURL = knowledgeSharePointCallbackURL(r)

	token, err := cfg.Exchange(r.Context(), code, oauth2.VerifierOption(verifier))
	if err != nil {
		writeOAuthResultPage(w, false, "Failed to exchange authorization code: "+err.Error())
		return
	}
	upn, err := fetchMicrosoftAccountUPN(r.Context(), cfg, token)
	if err != nil {
		writeOAuthResultPage(w, false, "Connected to Microsoft, but could not read the account identity: "+err.Error())
		return
	}

	// Reconnecting an already-known account (same user + external UPN)
	// must update that account in place, not create a second row -
	// mirrors handleKnowledgeGDriveOAuthCallback's find-or-create.
	accounts := a.backend.ConnectorAccounts
	kind := string(sharepoint.Kind)
	recordID := ""
	if existing, found, lookupErr := accounts.GetByKindAndExternalID(r.Context(), userID, kind, upn); lookupErr != nil {
		writeOAuthResultPage(w, false, "Failed to look up existing connector account: "+lookupErr.Error())
		return
	} else if found {
		recordID = existing.ID
	} else {
		record, createErr := accounts.Create(r.Context(), db.CreateConnectorAccountParams{
			UserID:            userID,
			Kind:              kind,
			DisplayName:       upn,
			ExternalAccountID: upn,
		})
		if createErr != nil {
			writeOAuthResultPage(w, false, "Failed to create connector account: "+createErr.Error())
			return
		}
		recordID = record.ID
	}

	if _, err := accounts.UpdateConnected(r.Context(), db.UpdateConnectorAccountConnectedParams{
		ID:                recordID,
		DisplayName:       upn,
		ExternalAccountID: upn,
		AccessToken:       token.AccessToken,
		RefreshToken:      token.RefreshToken,
		Scope:             strings.Join(sharepoint.Scopes, " "),
		ExpiresAt:         token.Expiry,
	}); err != nil {
		writeOAuthResultPage(w, false, "Failed to save the connected account: "+err.Error())
		return
	}
	writeOAuthResultPage(w, true, fmt.Sprintf("Connected %s. You can close this tab and return to Seshat.", upn))
}

// knowledgeSharePointCallbackURL derives the redirect URI from the incoming
// request's own host:port — see knowledgeGDriveCallbackURL's doc comment
// for why.
func knowledgeSharePointCallbackURL(r *http.Request) string {
	return fmt.Sprintf("http://%s/api/v1/knowledge/connectors/sharepoint/oauth/callback", r.Host)
}

// fetchMicrosoftAccountUPN reads the connected account's userPrincipalName
// (Microsoft's stable per-account identity, work/school tenant equivalent
// of an email address) via GET /me — the SharePoint counterpart of
// fetchGoogleAccountEmail. A direct HTTP call rather than a generated SDK
// client, matching internal/knowledge/sharepoint/graph.go's hand-rolled
// Graph client (no official Go SDK is vendored in this module).
func fetchMicrosoftAccountUPN(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	client := cfg.Client(ctx, token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://graph.microsoft.com/v1.0/me?$select=userPrincipalName", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("graph /me returned %d", resp.StatusCode)
	}
	var info struct {
		UserPrincipalName string `json:"userPrincipalName"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.UserPrincipalName == "" {
		return "", fmt.Errorf("no userPrincipalName in /me response")
	}
	return info.UserPrincipalName, nil
}
