package settings

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
)

// Service is a thin orchestrator over an injected Provider (List/Create/
// Update/Delete/SetDefault/Resolve* — local or remote depending on mode),
// plus OAuth and other provider-settings concerns that always stay local
// regardless of mode (see Provider's doc comment).
type Service struct {
	provider Provider
	local    *LocalProvider
}

func NewService(provider Provider, local *LocalProvider) *Service {
	return &Service{provider: provider, local: local}
}

// ─── CRUD / resolution (delegates to Provider) ─────────────────────────────────

func (s *Service) List(ctx context.Context, principal *backendauth.Principal) ([]ProviderSetting, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.List(ctx, principal)
}

func (s *Service) Get(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.Get(ctx, principal, id)
}

func (s *Service) Create(ctx context.Context, principal *backendauth.Principal, p CreateSettingParams) (*ProviderSetting, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.Create(ctx, principal, p)
}

func (s *Service) Update(ctx context.Context, principal *backendauth.Principal, id string, p UpdateSettingParams) (*ProviderSetting, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.Update(ctx, principal, id, p)
}

func (s *Service) Delete(ctx context.Context, principal *backendauth.Principal, id string) error {
	if s == nil || s.provider == nil {
		return bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.Delete(ctx, principal, id)
}

func (s *Service) SetDefault(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.SetDefault(ctx, principal, id)
}

func (s *Service) ResolveRuntimeConfig(ctx context.Context, principal *backendauth.Principal, id string) (*ResolvedProviderConfig, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.ResolveRuntimeConfig(ctx, principal, id)
}

func (s *Service) ResolveDefaultForUser(ctx context.Context, principal *backendauth.Principal) (*ResolvedProviderConfig, error) {
	if s == nil || s.provider == nil {
		return nil, nil
	}
	return s.provider.ResolveDefaultForUser(ctx, principal)
}

// OAuth and daemon paths go through the active provider so connected mode can
// scope personal settings away from stale standalone accounts.

func (s *Service) StartOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*OAuthChallenge, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.StartOAuth(ctx, principal, id)
}

func (s *Service) PollOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.PollOAuth(ctx, principal, id)
}

func (s *Service) DisconnectOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.DisconnectOAuth(ctx, principal, id)
}

func (s *Service) GetDecryptedAPIKey(ctx context.Context, principal *backendauth.Principal, id string) (string, error) {
	if s == nil || s.provider == nil {
		return "", bkerr.Unavailable("settings not configured", nil)
	}
	return s.provider.GetDecryptedAPIKey(ctx, principal, id)
}

// ResolveDefaultForUserID resolves credentials for a user's default provider
// by user ID alone — internal daemon callbacks, bypasses principal checks.
// Always local: a daemon (e.g. long-term memory extraction) has no
// organization/session context to resolve a remote hierarchy through.
func (s *Service) ResolveDefaultForUserID(ctx context.Context, userID string) (*ResolvedProviderConfig, error) {
	if s == nil || s.local == nil {
		return nil, nil
	}
	return s.local.ResolveDefaultForUserID(ctx, userID)
}
