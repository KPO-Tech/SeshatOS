package onedrive

import (
	"golang.org/x/oauth2"

	microsoftOAuth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/oauth/microsoft"
	coreconnectors "github.com/KPO-Tech/seshat/pkg/connectors"
)

// Scopes requested from Microsoft - read-only Files access plus
// openid/profile/offline_access (the last is required to receive a refresh
// token, Microsoft's equivalent of Google's access_type=offline). Read-only
// by design: this is a Knowledge connector, never writes back to OneDrive.
// Re-exported from core/connectors so there's exactly one list, shared with
// seshat-server's own onedrive connect flow.
var Scopes = coreconnectors.OneDriveScopes

// IsConfigured reports whether the shared Microsoft OAuth client
// (MICROSOFT_OAUTH_CLIENT_ID) is configured.
func IsConfigured() bool {
	return microsoftOAuth.IsConfigured()
}

// BaseOAuthConfig builds the OneDrive OAuth2 client config - see
// microsoftOAuth.BaseConfig for the shared client-ID sourcing, PKCE
// requirement, and "organizations" tenant endpoint this delegates to.
func BaseOAuthConfig() (*oauth2.Config, error) {
	return microsoftOAuth.BaseConfig(Scopes)
}
