// Package microsoft is the shared OAuth client config every
// Microsoft-Graph-backed connector uses (SharePoint today, possibly Outlook/
// Teams later) — mirrors internal/oauth/google's role for Google-backed
// connectors, but the flow shape differs in one structural way: Entra ID
// (Azure AD) requires a "Mobile and desktop applications" app registration
// to be a true public/native client, which must NOT present a client
// secret at token redemption — PKCE (RFC 7636) replaces it. Google's
// "Desktop app" client type still issues (and uses) a client secret even
// though it's also a native/public client in spirit; Microsoft's platform
// is stricter about this, so callers here must generate a PKCE verifier
// (oauth2.GenerateVerifier), pass oauth2.S256ChallengeOption(verifier) to
// AuthCodeURL, and oauth2.VerifierOption(verifier) to Exchange — the exact
// pattern already used server-side for OIDC logins
// (seshat-server/internal/server/iam/oidc.go).
package microsoft

import (
	"fmt"
	"os"
	"strings"

	"golang.org/x/oauth2"
)

// authURL/tokenURL target the "organizations" tenant — any work/school
// (Entra ID) account across any tenant, never a personal Microsoft account.
// SharePoint access (Sites.Read.All) isn't supported for personal accounts
// anyway, so there's no flexibility being given up here, and it matches
// Google's "one shared OAuth client works for every user" model instead of
// requiring a specific tenant ID at deploy time.
const (
	authURL  = "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize"
	tokenURL = "https://login.microsoftonline.com/organizations/oauth2/v2.0/token"
)

// IsConfigured reports whether MICROSOFT_OAUTH_CLIENT_ID is set — no
// corresponding secret env var exists, see the package doc comment for why.
func IsConfigured() bool {
	return strings.TrimSpace(os.Getenv("MICROSOFT_OAUTH_CLIENT_ID")) != ""
}

// BaseConfig builds the Microsoft identity platform OAuth2 client config
// for the given scopes, with an empty RedirectURL — same convention as
// googleOAuth.BaseConfig, filled in per-request by the caller from the
// incoming request's own host:port.
func BaseConfig(scopes []string) (*oauth2.Config, error) {
	clientID := strings.TrimSpace(os.Getenv("MICROSOFT_OAUTH_CLIENT_ID"))
	if clientID == "" {
		return nil, fmt.Errorf("MICROSOFT_OAUTH_CLIENT_ID is not configured")
	}
	return &oauth2.Config{
		ClientID: clientID,
		Endpoint: oauth2.Endpoint{AuthURL: authURL, TokenURL: tokenURL},
		Scopes:   scopes,
	}, nil
}
