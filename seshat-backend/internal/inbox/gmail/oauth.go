package gmail

import (
	"golang.org/x/oauth2"

	googleOAuth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/oauth/google"
	coregmail "github.com/KPO-Tech/seshat/pkg/gmail"
)

// Scopes requested from Google - re-exported from core/gmail so there's
// exactly one list, shared with seshat-server's own gmail connect flow.
var Scopes = coregmail.Scopes

// IsConfigured reports whether GOOGLE_OAUTH_CLIENT_ID/SECRET are set -
// bootstrap.go uses this to decide whether to register the Gmail connector
// at all, the same way other optional integrations (document readers, web search
// providers) are skipped rather than half-initialized when unconfigured.
func IsConfigured() bool {
	return googleOAuth.IsConfigured()
}

// BaseOAuthConfig builds the Gmail OAuth2 client config - see
// googleOAuth.BaseConfig for the shared client-ID/secret sourcing and
// "Desktop app" redirect setup this delegates to.
func BaseOAuthConfig() (*oauth2.Config, error) {
	return googleOAuth.BaseConfig(Scopes)
}
