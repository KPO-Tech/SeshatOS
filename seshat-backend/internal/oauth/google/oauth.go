// Package google is the shared OAuth client config every Google-backed
// connector uses (Gmail, Google Drive, ...) - extracted from gmail's
// original oauth.go once a second product needed the exact same
// client-ID/secret-sourcing and "Desktop app" loopback-redirect setup, to
// avoid duplicating it per connector.
package google

import (
	"fmt"
	"os"
	"strings"

	"golang.org/x/oauth2"
	oauth2google "golang.org/x/oauth2/google"
)

// IsConfigured reports whether GOOGLE_OAUTH_CLIENT_ID/SECRET are set - the
// single Google Cloud OAuth client every Google-backed connector shares
// (see BaseConfig's doc comment on why one client works for all of them).
func IsConfigured() bool {
	return strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_ID")) != "" &&
		strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET")) != ""
}

// BaseConfig builds the Google OAuth2 client config from
// GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET for the given scopes,
// with an empty RedirectURL - the caller (internal/api's OAuth start/callback
// handlers) fills that in per-request from the incoming request's own
// host:port, since this app's local HTTP server's port isn't fixed (main.go
// falls back to an OS-assigned port if the preferred one is taken) and
// can't be known this early. The Google Cloud OAuth client must be
// registered as a "Desktop app" type, which Google treats as a native app
// under RFC 8252 and accepts any loopback port for - not "Web application",
// which would require every possible port pre-registered.
//
// One client for the whole deployment, shared across every Google-backed
// connector: Google scopes are additive per authorization, so Gmail's and
// Drive's consent screens simply request their own different scope sets
// through the same registered app rather than needing separate app
// registrations.
func BaseConfig(scopes []string) (*oauth2.Config, error) {
	clientID := strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_ID"))
	clientSecret := strings.TrimSpace(os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"))
	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not configured")
	}
	return &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     oauth2google.Endpoint,
		Scopes:       scopes,
	}, nil
}
