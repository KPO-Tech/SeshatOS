package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	oauth2api "google.golang.org/api/oauth2/v2"
	"google.golang.org/api/option"
)

// fetchGoogleAccountEmail resolves the connected Google account's email
// from an exchanged OAuth token - shared by every Google-backed connector
// (Drive, ...) that identifies its account by email rather than an opaque
// provider ID.
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

// oauthStateTTL bounds how long a CSRF state value stays redeemable across
// every redirect-based OAuth flow this app handles (Gmail, Google Drive,
// SharePoint, ...) - long enough for a user to complete the provider's
// consent screen, short enough that an abandoned attempt doesn't linger.
const oauthStateTTL = 10 * time.Minute

type oauthState struct {
	userID    string
	createdAt time.Time
	// codeVerifier is the PKCE verifier for flows that need one instead of
	// (or alongside) a client secret - empty for Google-backed connectors
	// (Drive), which authenticate with a client secret and don't use PKCE.
	// Populated for Microsoft-backed connectors (SharePoint), whose Entra ID
	// app registration must be a public/native client - see
	// internal/oauth/microsoft's package doc comment.
	codeVerifier string
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
