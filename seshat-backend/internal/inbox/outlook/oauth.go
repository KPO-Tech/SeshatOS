package outlook

import (
	"golang.org/x/oauth2"

	microsoftOAuth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/oauth/microsoft"
	coremsgraph "github.com/KPO-Tech/seshat/pkg/msgraph"
)

// Scopes requested from Microsoft - write-capable (Mail.Send), unlike
// sharepoint's deliberately read-only stance, since Inbox needs to
// reply. Re-exported from core/msgraph so there's exactly one list, shared
// with seshat-server's own outlook connect flow.
var Scopes = coremsgraph.MailScopes

// IsConfigured reports whether the shared Microsoft OAuth client
// (MICROSOFT_OAUTH_CLIENT_ID) is configured.
func IsConfigured() bool {
	return microsoftOAuth.IsConfigured()
}

// BaseOAuthConfig builds the Outlook OAuth2 client config - see
// microsoftOAuth.BaseConfig for the shared client-ID sourcing, PKCE
// requirement, and "organizations" tenant endpoint this delegates to.
func BaseOAuthConfig() (*oauth2.Config, error) {
	return microsoftOAuth.BaseConfig(Scopes)
}
