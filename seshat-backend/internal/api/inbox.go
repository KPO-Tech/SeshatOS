package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/agents"
	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox/gmail"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox/outlook"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox/teams"
	"golang.org/x/oauth2"
	oauth2api "google.golang.org/api/oauth2/v2"
	"google.golang.org/api/option"
)

const oauthStateTTL = 10 * time.Minute

type oauthState struct {
	userID    string
	createdAt time.Time
	// codeVerifier is the PKCE verifier for flows that need one instead of
	// (or alongside) a client secret - empty for Google-backed connectors
	// (Gmail, Drive), which authenticate with a client secret and don't use
	// PKCE. Populated for Microsoft-backed connectors (SharePoint), whose
	// Entra ID app registration must be a public/native client - see
	// internal/oauth/microsoft's package doc comment.
	codeVerifier string
}

type channelAccountResponse struct {
	ID                string `json:"id"`
	Channel           string `json:"channel"`
	DisplayName       string `json:"display_name"`
	ExternalAccountID string `json:"external_account_id"`
	Status            string `json:"status"`
	LastSyncedAt      int64  `json:"last_synced_at,omitempty"`
	LastError         string `json:"last_error,omitempty"`
	CreatedAt         int64  `json:"created_at"`
}

func channelAccountToResponse(a inbox.ChannelAccount) channelAccountResponse {
	resp := channelAccountResponse{
		ID:                a.ID,
		Channel:           a.Channel,
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

// handleInboxAccounts handles GET /inbox/accounts
func (a *App) handleInboxAccounts(w http.ResponseWriter, r *http.Request) {
	if a.backend.Inbox == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "inbox is not configured")
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
	accounts, err := a.backend.Inbox.ListAccounts(r.Context(), principal)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	items := make([]channelAccountResponse, 0, len(accounts))
	for _, acc := range accounts {
		items = append(items, channelAccountToResponse(acc))
	}
	writeJSON(w, http.StatusOK, map[string]any{"accounts": items, "count": len(items)})
}

// handleInboxAccountByID handles /inbox/accounts/{id} and sub-paths:
//
//	DELETE /inbox/accounts/{id}         → disconnect
//	POST   /inbox/accounts/{id}/sync    → sync now
func (a *App) handleInboxAccountByID(w http.ResponseWriter, r *http.Request) {
	if a.backend.Inbox == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "inbox is not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/inbox/accounts/")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		writeJSONError(w, http.StatusBadRequest, "account id is required")
		return
	}
	parts := strings.Split(rest, "/")
	accountID := parts[0]

	if len(parts) == 1 {
		if r.Method != http.MethodDelete {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := a.backend.Inbox.DisconnectAccount(r.Context(), principal, accountID); err != nil {
			writeBackendError(w, err)
			return
		}
		// The service only flips the DB status - a WhatsApp account may still
		// have a live whatsmeow connection running in Manager's memory (it
		// doesn't know about DB status changes), so drop it explicitly here.
		// Safe to call even if this account was never a WhatsApp connection.
		if a.whatsappManager != nil {
			a.whatsappManager.Disconnect(accountID)
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if len(parts) == 2 && parts[1] == "sync" {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		n, err := a.backend.Inbox.SyncAccount(r.Context(), principal, accountID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"new_messages": n})
		return
	}

	writeJSONError(w, http.StatusNotFound, "unknown account sub-resource")
}

// handleInboxGmailOAuthStart handles POST /inbox/accounts/gmail/oauth/start.
// Returns an authorization_url the client (Electron main process) opens in
// the system browser - Google's OAuth consent screen for Gmail's restricted
// scopes must run in a real, trusted browser context, not an embedded
// webview.
func (a *App) handleInboxGmailOAuthStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	cfg, err := gmail.BaseOAuthConfig()
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
	cfgCopy.RedirectURL = gmailCallbackURL(r)
	authURL := cfgCopy.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"))
	writeJSON(w, http.StatusOK, map[string]any{"authorization_url": authURL})
}

// handleInboxGmailOAuthCallback handles GET /inbox/accounts/gmail/oauth/callback
// - Google redirects the user's browser here after consent. This request
// carries no Authorization header (it's the browser, not the Electron app,
// making it), so the principal comes from the signed state issued in
// handleInboxGmailOAuthStart instead of the usual auth middleware.
func (a *App) handleInboxGmailOAuthCallback(w http.ResponseWriter, r *http.Request) {
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
	if a.backend.Inbox == nil {
		writeOAuthResultPage(w, false, "Inbox is not configured on this server.")
		return
	}

	cfg, err := gmail.BaseOAuthConfig()
	if err != nil {
		writeOAuthResultPage(w, false, err.Error())
		return
	}
	cfg.RedirectURL = gmailCallbackURL(r)

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

	principal := &backendauth.Principal{User: backendauth.User{ID: userID}}
	_, err = a.backend.Inbox.ConnectAccount(r.Context(), principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelGmail,
		DisplayName:       email,
		ExternalAccountID: email,
		AccessToken:       token.AccessToken,
		RefreshToken:      token.RefreshToken,
		Scope:             strings.Join(gmail.Scopes, " "),
		ExpiresAt:         token.Expiry,
	})
	if err != nil {
		writeOAuthResultPage(w, false, "Failed to save the connected account: "+err.Error())
		return
	}
	a.ensureInboxAgent(r.Context())
	writeOAuthResultPage(w, true, fmt.Sprintf("Connected %s. You can close this tab and return to Seshat.", email))
}

// microsoftInboxChannel parameterizes the shared PKCE OAuth dance below
// across outlook/teams - they differ only in channel string, which
// package's BaseOAuthConfig/Scopes to use, and the callback URL's channel
// segment. Unlike Gmail, both need PKCE (Microsoft's public/native client
// model - see internal/oauth/microsoft's package doc comment), so this
// mirrors handleKnowledgeSharePointOAuthStart/Callback's shape, not Gmail's.
type microsoftInboxChannel struct {
	channel         string
	baseOAuthConfig func() (*oauth2.Config, error)
	scopes          []string
}

func (a *App) handleInboxMicrosoftOAuthStart(w http.ResponseWriter, r *http.Request, ch microsoftInboxChannel) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	cfg, err := ch.baseOAuthConfig()
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
	cfgCopy.RedirectURL = inboxMicrosoftCallbackURL(r, ch.channel)
	authURL := cfgCopy.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier))
	writeJSON(w, http.StatusOK, map[string]any{"authorization_url": authURL})
}

func (a *App) handleInboxMicrosoftOAuthCallback(w http.ResponseWriter, r *http.Request, ch microsoftInboxChannel) {
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
	if a.backend.Inbox == nil {
		writeOAuthResultPage(w, false, "Inbox is not configured on this server.")
		return
	}

	cfg, err := ch.baseOAuthConfig()
	if err != nil {
		writeOAuthResultPage(w, false, err.Error())
		return
	}
	cfg.RedirectURL = inboxMicrosoftCallbackURL(r, ch.channel)

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

	principal := &backendauth.Principal{User: backendauth.User{ID: userID}}
	_, err = a.backend.Inbox.ConnectAccount(r.Context(), principal, inbox.ConnectAccountParams{
		Channel:           ch.channel,
		DisplayName:       upn,
		ExternalAccountID: upn,
		AccessToken:       token.AccessToken,
		RefreshToken:      token.RefreshToken,
		Scope:             strings.Join(ch.scopes, " "),
		ExpiresAt:         token.Expiry,
	})
	if err != nil {
		writeOAuthResultPage(w, false, "Failed to save the connected account: "+err.Error())
		return
	}
	a.ensureInboxAgent(r.Context())
	writeOAuthResultPage(w, true, fmt.Sprintf("Connected %s. You can close this tab and return to Seshat.", upn))
}

// inboxMicrosoftCallbackURL derives the redirect URI from the incoming
// request's own host:port, same reasoning as gmailCallbackURL.
func inboxMicrosoftCallbackURL(r *http.Request, channel string) string {
	return fmt.Sprintf("http://%s/api/v1/inbox/accounts/%s/oauth/callback", r.Host, channel)
}

// handleInboxOutlookOAuthStart handles POST /inbox/accounts/outlook/oauth/start.
func (a *App) handleInboxOutlookOAuthStart(w http.ResponseWriter, r *http.Request) {
	a.handleInboxMicrosoftOAuthStart(w, r, microsoftInboxChannel{
		channel: inbox.ChannelOutlook, baseOAuthConfig: outlook.BaseOAuthConfig, scopes: outlook.Scopes,
	})
}

// handleInboxOutlookOAuthCallback handles GET /inbox/accounts/outlook/oauth/callback.
func (a *App) handleInboxOutlookOAuthCallback(w http.ResponseWriter, r *http.Request) {
	a.handleInboxMicrosoftOAuthCallback(w, r, microsoftInboxChannel{
		channel: inbox.ChannelOutlook, baseOAuthConfig: outlook.BaseOAuthConfig, scopes: outlook.Scopes,
	})
}

// handleInboxTeamsOAuthStart handles POST /inbox/accounts/teams/oauth/start.
func (a *App) handleInboxTeamsOAuthStart(w http.ResponseWriter, r *http.Request) {
	a.handleInboxMicrosoftOAuthStart(w, r, microsoftInboxChannel{
		channel: inbox.ChannelTeams, baseOAuthConfig: teams.BaseOAuthConfig, scopes: teams.Scopes,
	})
}

// handleInboxTeamsOAuthCallback handles GET /inbox/accounts/teams/oauth/callback.
func (a *App) handleInboxTeamsOAuthCallback(w http.ResponseWriter, r *http.Request) {
	a.handleInboxMicrosoftOAuthCallback(w, r, microsoftInboxChannel{
		channel: inbox.ChannelTeams, baseOAuthConfig: teams.BaseOAuthConfig, scopes: teams.Scopes,
	})
}

// ensureInboxAgent creates the Inbox Agent (see agents.DefaultInboxAgentParams)
// the first time any channel account connects, so the user has something to
// actually talk to right after their first Gmail/WhatsApp connection instead
// of a working inbox with no agent pointed at it. Idempotent by slug - a
// NotFound from GetBySlug means "not created yet", anything else (including
// success) means there's nothing to do. Best-effort: a failure here doesn't
// undo the channel connection that just succeeded, only logs.
func (a *App) ensureInboxAgent(ctx context.Context) {
	if a.backend.Agents == nil {
		return
	}
	if err := a.backend.Agents.EnsureDefault(ctx, agents.DefaultInboxAgentParams()); err != nil {
		fmt.Fprintf(os.Stderr, "[API] Avertissement: création de l'Inbox Agent échouée: %v\n", err)
	}
}

func fetchGoogleAccountEmail(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (string, error) {
	svc, err := oauth2api.NewService(ctx, option.WithTokenSource(cfg.TokenSource(ctx, token)))
	if err != nil {
		return "", err
	}
	info, err := svc.Userinfo.Get().Context(ctx).Do()
	if err != nil {
		return "", err
	}
	if info.Email == "" {
		return "", fmt.Errorf("no email in userinfo response")
	}
	return info.Email, nil
}

func (a *App) storeOAuthState(state, userID string) {
	a.storeOAuthStateWithVerifier(state, userID, "")
}

// storeOAuthStateWithVerifier is storeOAuthState plus a PKCE code verifier
// to carry across the redirect round trip - see oauthState.codeVerifier's
// doc comment.
func (a *App) storeOAuthStateWithVerifier(state, userID, codeVerifier string) {
	a.oauthMu.Lock()
	defer a.oauthMu.Unlock()
	a.oauthStates[state] = oauthState{userID: userID, createdAt: time.Now(), codeVerifier: codeVerifier}
	// Opportunistic sweep of expired entries - this map only ever holds as
	// many concurrent entries as there are in-flight OAuth attempts, so a
	// full scan on every new one is cheap.
	for s, st := range a.oauthStates {
		if time.Since(st.createdAt) > oauthStateTTL {
			delete(a.oauthStates, s)
		}
	}
}

func (a *App) takeOAuthState(state string) (string, bool) {
	userID, _, ok := a.takeOAuthStateWithVerifier(state)
	return userID, ok
}

// takeOAuthStateWithVerifier is takeOAuthState plus the stored PKCE code
// verifier (empty for a state stored via plain storeOAuthState).
func (a *App) takeOAuthStateWithVerifier(state string) (userID, codeVerifier string, ok bool) {
	a.oauthMu.Lock()
	defer a.oauthMu.Unlock()
	st, found := a.oauthStates[state]
	if !found {
		return "", "", false
	}
	delete(a.oauthStates, state) // single use
	if time.Since(st.createdAt) > oauthStateTTL {
		return "", "", false
	}
	return st.userID, st.codeVerifier, true
}

func randomState() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// gmailCallbackURL derives the redirect URI from the incoming request's own
// host:port rather than a fixed config value, since this server's port can
// change if the preferred one was taken (see cmd/api/config.go). Relies on
// the Google Cloud OAuth client being registered as a "Desktop app" type,
// which Google accepts any loopback port for.
func gmailCallbackURL(r *http.Request) string {
	scheme := "http"
	return fmt.Sprintf("%s://%s/api/v1/inbox/accounts/gmail/oauth/callback", scheme, r.Host)
}

func writeOAuthResultPage(w http.ResponseWriter, ok bool, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
	}
	title := "Connected"
	if !ok {
		title = "Connection failed"
	}
	fmt.Fprintf(w, `<!doctype html><html><head><meta charset="utf-8"><title>%s</title></head>`+
		`<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee">`+
		`<div style="text-align:center;max-width:420px"><h2>%s</h2><p>%s</p></div></body></html>`,
		title, title, message)
}

// handleInboxWhatsAppPair handles POST /inbox/accounts/whatsapp/pair - an
// SSE stream, unlike Gmail's redirect-based flow, because WhatsApp pairing
// is inherently live: the QR code must be shown to the user and rotates
// periodically until they scan it (see whatsapp.Manager.PairNewDevice).
// The stream emits "qr" events with each code to render, then a single
// "done" or "error" event before closing.
func (a *App) handleInboxWhatsAppPair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if a.whatsappManager == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "whatsapp is not configured")
		return
	}
	if a.backend.Inbox == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "inbox is not configured")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, "streaming not supported by transport")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	writeSSE := func(event string, payload any) {
		data, err := json.Marshal(payload)
		if err != nil {
			return
		}
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
		flusher.Flush()
	}

	client, paired, err := a.whatsappManager.PairNewDevice(r.Context(), func(code string) {
		writeSSE("qr", map[string]string{"code": code})
	})
	if err != nil {
		writeSSE("error", map[string]string{"error": err.Error()})
		return
	}

	account, err := a.backend.Inbox.ConnectAccount(r.Context(), principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       paired.PushName,
		ExternalAccountID: paired.JID,
	})
	if err != nil {
		client.Disconnect()
		writeSSE("error", map[string]string{"error": "paired with WhatsApp but failed to save the account: " + err.Error()})
		return
	}
	a.whatsappManager.Adopt(account.ID, client)
	a.ensureInboxAgent(r.Context())

	writeSSE("done", map[string]string{"account_id": account.ID, "display_name": account.DisplayName})
}

// ─── Threads & messages (human-facing REST surface) ────────────────────────
//
// Separate from the inbox_* agent tools (internal/inbox/tool) - those exist
// for the Inbox Agent to call from within a chat turn; these exist so the
// Inbox app page can browse and reply to threads directly, without going
// through a chat session at all.

type contactResponse struct {
	ID          string `json:"id"`
	ExternalID  string `json:"external_id"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url,omitempty"`
}

type threadResponse struct {
	ID               string          `json:"id"`
	ChannelAccountID string          `json:"channel_account_id"`
	Channel          string          `json:"channel"`
	Contact          contactResponse `json:"contact"`
	Subject          string          `json:"subject,omitempty"`
	Status           string          `json:"status"`
	PriorityScore    float64         `json:"priority_score"`
	LastMessageAt    int64           `json:"last_message_at"`
}

type attachmentResponse struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

type messageResponse struct {
	ID          string               `json:"id"`
	ThreadID    string               `json:"thread_id"`
	Direction   string               `json:"direction"`
	BodyText    string               `json:"body_text"`
	Attachments []attachmentResponse `json:"attachments,omitempty"`
	IsDraft     bool                 `json:"is_draft"`
	SentAt      int64                `json:"sent_at"`
}

func threadToResponse(th inbox.Thread) threadResponse {
	return threadResponse{
		ID:               th.ID,
		ChannelAccountID: th.ChannelAccountID,
		Channel:          th.Channel,
		Contact: contactResponse{
			ID:          th.Contact.ID,
			ExternalID:  th.Contact.ExternalID,
			DisplayName: th.Contact.DisplayName,
			AvatarURL:   th.Contact.AvatarURL,
		},
		Subject:       th.Subject,
		Status:        th.Status,
		PriorityScore: th.PriorityScore,
		LastMessageAt: th.LastMessageAt.Unix(),
	}
}

func messageToResponse(m inbox.Message) messageResponse {
	atts := make([]attachmentResponse, 0, len(m.Attachments))
	for _, a := range m.Attachments {
		atts = append(atts, attachmentResponse{
			ID:          a.ID,
			Filename:    a.Filename,
			ContentType: a.ContentType,
			Size:        a.Size,
		})
	}
	return messageResponse{
		ID:          m.ID,
		ThreadID:    m.ThreadID,
		Direction:   m.Direction,
		BodyText:    m.BodyText,
		Attachments: atts,
		IsDraft:     m.IsDraft,
		SentAt:      m.SentAt.Unix(),
	}
}

// handleInboxThreads handles GET /inbox/threads?status=&limit=
func (a *App) handleInboxThreads(w http.ResponseWriter, r *http.Request) {
	if a.backend.Inbox == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "inbox is not configured")
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit := 0
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}
	offset := 0
	if raw := r.URL.Query().Get("offset"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			offset = n
		}
	}
	threads, hasMore, err := a.backend.Inbox.ListThreads(r.Context(), principal, inbox.ListThreadsParams{
		Status: r.URL.Query().Get("status"),
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		writeBackendError(w, err)
		return
	}
	items := make([]threadResponse, 0, len(threads))
	for _, th := range threads {
		items = append(items, threadToResponse(th))
	}
	writeJSON(w, http.StatusOK, map[string]any{"threads": items, "count": len(items), "has_more": hasMore, "offset": offset})
}

// handleInboxThreadByID handles /inbox/threads/{id} and sub-paths:
//
//	GET   /inbox/threads/{id}                                              → thread + full message history
//	PATCH /inbox/threads/{id}                                              → {"status": "..."} update triage status
//	POST  /inbox/threads/{id}/reply                                        → {"body": "...", "send": bool} draft or send
//	GET   /inbox/threads/{id}/messages/{messageID}/attachments/{attachID}  → streams the attachment's bytes
func (a *App) handleInboxThreadByID(w http.ResponseWriter, r *http.Request) {
	if a.backend.Inbox == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "inbox is not configured")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/inbox/threads/")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		writeJSONError(w, http.StatusBadRequest, "thread id is required")
		return
	}
	parts := strings.Split(rest, "/")
	threadID := parts[0]

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			msgOffset := 0
			if raw := r.URL.Query().Get("message_offset"); raw != "" {
				if n, err := strconv.Atoi(raw); err == nil {
					msgOffset = n
				}
			}
			thread, messages, messagesHasMore, err := a.backend.Inbox.GetThread(r.Context(), principal, threadID, msgOffset)
			if err != nil {
				writeBackendError(w, err)
				return
			}
			msgItems := make([]messageResponse, 0, len(messages))
			for _, m := range messages {
				msgItems = append(msgItems, messageToResponse(m))
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"thread":            threadToResponse(*thread),
				"messages":          msgItems,
				"messages_has_more": messagesHasMore,
				"messages_offset":   msgOffset,
			})
		case http.MethodPatch:
			var body struct {
				Status string `json:"status"`
			}
			if !decodeJSONBody(w, r, &body) {
				return
			}
			if strings.TrimSpace(body.Status) == "" {
				writeJSONError(w, http.StatusBadRequest, "status is required")
				return
			}
			if err := a.backend.Inbox.UpdateThreadStatus(r.Context(), principal, threadID, body.Status); err != nil {
				writeBackendError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	if len(parts) == 2 && parts[1] == "reply" {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			Body string `json:"body"`
			Send bool   `json:"send"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if strings.TrimSpace(body.Body) == "" {
			writeJSONError(w, http.StatusBadRequest, "body is required")
			return
		}
		params := inbox.SendReplyParams{ThreadID: threadID, Body: body.Body}
		var (
			msg *inbox.Message
			err error
		)
		if body.Send {
			msg, err = a.backend.Inbox.SendReply(r.Context(), principal, params)
		} else {
			msg, err = a.backend.Inbox.SaveDraft(r.Context(), principal, params)
		}
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, messageToResponse(*msg))
		return
	}

	if len(parts) == 5 && parts[1] == "messages" && parts[3] == "attachments" {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		messageID := parts[2]
		attachmentID := parts[4]
		reader, att, err := a.backend.Inbox.OpenAttachment(r.Context(), principal, threadID, messageID, attachmentID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		defer reader.Close()
		ct := att.ContentType
		if ct == "" {
			ct = "application/octet-stream"
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, att.Filename))
		w.WriteHeader(http.StatusOK)
		_, _ = io.Copy(w, reader)
		return
	}

	writeJSONError(w, http.StatusNotFound, "unknown thread sub-resource")
}
