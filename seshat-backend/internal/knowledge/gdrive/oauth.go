package gdrive

import (
	"golang.org/x/oauth2"

	googleOAuth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/oauth/google"
	coreconnectors "github.com/KPO-Tech/seshat/pkg/connectors"
)

// Scopes requested from Google - read-only Drive access plus the account's
// email (used as ExternalAccountID, mirroring gmail). Read-only by
// design: this is a Knowledge connector (see helps/roadmap.md Phase 1),
// never writes back to Drive. Re-exported from core/connectors so there's
// exactly one list, shared with seshat-server's own gdrive connect flow.
var Scopes = coreconnectors.GDriveScopes

// IsConfigured reports whether the shared Google OAuth client
// (GOOGLE_OAUTH_CLIENT_ID/SECRET) is configured - the same client Gmail
// uses, see oauth/google's package doc.
func IsConfigured() bool {
	return googleOAuth.IsConfigured()
}

// BaseOAuthConfig builds the Google Drive OAuth2 client config - see
// googleOAuth.BaseConfig for the shared client-ID/secret sourcing and
// "Desktop app" redirect setup this delegates to.
func BaseOAuthConfig() (*oauth2.Config, error) {
	return googleOAuth.BaseConfig(Scopes)
}
