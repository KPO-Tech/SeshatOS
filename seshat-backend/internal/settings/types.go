package settings

import "time"

const (
	AuthKindNone   = "none"
	AuthKindAPIKey = "api_key"
	AuthKindOAuth  = "oauth"
)

const (
	ConnectionStatusReady              = "ready"
	ConnectionStatusMissingCredentials = "missing_credentials"
	ConnectionStatusNotConnected       = "not_connected"
	ConnectionStatusPending            = "pending"
	ConnectionStatusConnected          = "connected"
	ConnectionStatusExpired            = "expired"
	ConnectionStatusError              = "error"
	ConnectionStatusRevoked            = "revoked"
)

type ProviderSetting struct {
	ID                string
	UserID            string
	Provider          string
	Name              string
	AuthKind          string
	BaseURL           string
	ModelID           string
	HasAPIKey         bool
	IsDefault         bool
	ConnectionStatus  string
	LastError         string
	OAuthAccountEmail string
	OAuthSubject      string
	OAuthExpiresAt    time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type CreateSettingParams struct {
	Provider string
	Name     string
	AuthKind string
	BaseURL  string
	ModelID  string
	APIKey   string // plaintext, optional
}

type UpdateSettingParams struct {
	Name     *string
	AuthKind *string
	BaseURL  *string
	ModelID  *string
	APIKey   *string // nil = keep existing; ptr-to-empty-string = clear
}

type OAuthChallenge struct {
	Status              string
	UserCode            string
	VerificationURL     string
	PollIntervalSeconds int
	ExpiresAt           time.Time
}

type ResolvedProviderConfig struct {
	SettingID string
	Provider  string
	AuthKind  string
	BaseURL   string
	ModelID   string
	Secret    string
}
