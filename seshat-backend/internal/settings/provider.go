package settings

import (
	"context"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
)

// Provider is the provider-settings backend behind Service: seshat-backend's
// own local store in standalone mode (LocalProvider), or a remote
// seshat-server in connected mode (cloudsettings.Provider) implementing the
// three-tier hierarchy — organization → platform default → local personal
// key (see helps/seshat-architecture-target.md §3). Exactly one is selected
// once at bootstrap, same convention as auth.Provider/cloudidentity.Provider.
//
// OAuth (StartOAuth/PollOAuth/DisconnectOAuth/GetDecryptedAPIKey) and the
// daemon-only ResolveDefaultForUserID are intentionally NOT part of this
// interface — seshat-server's ProviderSetting has no OAuth concept at all
// (only provider/default_model/base_url/api_key), so those always operate on
// the local store directly regardless of mode, same treatment as Workspace/
// API keys in the identity migration.
type Provider interface {
	List(ctx context.Context, principal *backendauth.Principal) ([]ProviderSetting, error)
	Get(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error)
	Create(ctx context.Context, principal *backendauth.Principal, p CreateSettingParams) (*ProviderSetting, error)
	Update(ctx context.Context, principal *backendauth.Principal, id string, p UpdateSettingParams) (*ProviderSetting, error)
	Delete(ctx context.Context, principal *backendauth.Principal, id string) error
	SetDefault(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error)
	StartOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*OAuthChallenge, error)
	PollOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error)
	DisconnectOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error)
	GetDecryptedAPIKey(ctx context.Context, principal *backendauth.Principal, id string) (string, error)
	ResolveRuntimeConfig(ctx context.Context, principal *backendauth.Principal, id string) (*ResolvedProviderConfig, error)
	ResolveDefaultForUser(ctx context.Context, principal *backendauth.Principal) (*ResolvedProviderConfig, error)
}
