package teams

import (
	"golang.org/x/oauth2"

	microsoftOAuth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/oauth/microsoft"
	coremsgraph "github.com/KPO-Tech/seshat/pkg/msgraph"
)

// Scopes requested from Microsoft - 1:1/group chats only for v1, see
// coremsgraph.TeamsScopes' doc comment. Re-exported from core/msgraph so
// there's exactly one list, shared with seshat-server's own teams connect
// flow.
var Scopes = coremsgraph.TeamsScopes

// IsConfigured reports whether the shared Microsoft OAuth client
// (MICROSOFT_OAUTH_CLIENT_ID) is configured - the same one outlook/
// sharepoint use, since Graph scopes are additive across grants.
func IsConfigured() bool {
	return microsoftOAuth.IsConfigured()
}

// BaseOAuthConfig builds the Teams OAuth2 client config - see
// microsoftOAuth.BaseConfig for the shared client-ID sourcing, PKCE
// requirement, and "organizations" tenant endpoint this delegates to.
func BaseOAuthConfig() (*oauth2.Config, error) {
	return microsoftOAuth.BaseConfig(Scopes)
}
