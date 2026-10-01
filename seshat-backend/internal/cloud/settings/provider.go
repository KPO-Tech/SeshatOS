package cloudsettings

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/providers"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/automation"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/settings"
)

const (
	prefixOrg      = "org:"
	prefixPlatform = "platform:"
)

var _ settings.Provider = (*Provider)(nil)

// Provider implements settings.Provider against a remote seshat-server in
// connected mode. Organization settings are read-only synthetic entries, while
// personal local settings are stored under a cloud-scoped local user id so a
// standalone/local test account can never leak into a connected account.
type Provider struct {
	client   *Client
	local    *settings.LocalProvider
	policies *cloudautomation.PolicyStore
}

func NewProvider(serverURL string, local *settings.LocalProvider, policies *cloudautomation.PolicyStore) *Provider {
	return &Provider{client: NewClient(serverURL), local: local, policies: policies}
}

// knownProviders is used for provider validation and default fallback ordering.
// List uses seshat-server's member-safe /provider-settings/usable endpoint
// instead of probing /resolve for every known provider.
var knownProviders = []string{"anthropic", "openai", "codex", "mistral", "gemini", "z-ai", "minimax", "openrouter", "ollama", "kimi", "deepseek", "opencode", "workers-ai"}

func (p *Provider) List(ctx context.Context, principal *backendauth.Principal) ([]settings.ProviderSetting, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	local, err := p.local.List(ctx, p.localPrincipal(principal))
	if err != nil {
		return nil, err
	}

	out := make([]settings.ProviderSetting, 0, len(local)+len(knownProviders))
	out = append(out, local...)

	localProviders := make(map[string]bool, len(local))
	for _, entry := range local {
		localProviders[strings.ToLower(strings.TrimSpace(entry.Provider))] = true
	}

	organizationID := principal.OrganizationID()
	if organizationID == "" {
		return out, nil
	}
	remote, err := p.client.ListUsableProviderSettings(ctx, principal.AuthSession.ID, organizationID)
	if err != nil {
		return out, nil
	}
	for _, entry := range remote {
		provider := strings.ToLower(strings.TrimSpace(entry.Provider))
		if provider == "" || localProviders[provider] {
			continue
		}
		out = append(out, remoteToDisplaySetting(prefixOrg+provider, provider, entry.DefaultModel, entry.BaseURL))
	}
	return out, nil
}

func (p *Provider) Get(ctx context.Context, principal *backendauth.Principal, id string) (*settings.ProviderSetting, error) {
	if tier, provider, ok := parseSyntheticID(id); ok {
		if err := backendauth.EnsureAuthenticated(principal); err != nil {
			return nil, err
		}
		resolved, err := p.client.ResolveProviderSetting(ctx, principal.AuthSession.ID, principal.OrganizationID(), provider)
		if err != nil {
			return nil, cloudhttp.Translate(err)
		}
		if resolved.Source != tier {
			return nil, bkerr.NotFound("provider setting not found", nil)
		}
		result := remoteToDisplaySetting(id, resolved.Provider, resolved.DefaultModel, resolved.BaseURL)
		return &result, nil
	}
	return p.local.Get(ctx, p.localPrincipal(principal), id)
}

func (p *Provider) Create(ctx context.Context, principal *backendauth.Principal, params settings.CreateSettingParams) (*settings.ProviderSetting, error) {
	if err := p.checkCreatePolicy(ctx, params.Provider, params.BaseURL); err != nil {
		return nil, err
	}
	return p.local.Create(ctx, p.localPrincipal(principal), params)
}

func (p *Provider) checkCreatePolicy(ctx context.Context, provider, baseURL string) error {
	if p.policies == nil {
		return nil
	}
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "ollama" {
		if !p.policies.Allowed(ctx, cloudautomation.DesktopPolicyAllowLocalModels) {
			return bkerr.Forbidden("your organization does not allow using local models", nil)
		}
		return nil
	}

	isCustom := !isKnownProvider(provider)
	if !isCustom {
		baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
		if baseURL != "" && !strings.EqualFold(baseURL, strings.TrimRight(providers.DefaultBaseURL(provider), "/")) {
			isCustom = true
		}
	}
	if isCustom && !p.policies.Allowed(ctx, cloudautomation.DesktopPolicyAllowCustomProviders) {
		return bkerr.Forbidden("your organization does not allow adding custom providers", nil)
	}
	return nil
}

func isKnownProvider(provider string) bool {
	for _, known := range knownProviders {
		if known == provider {
			return true
		}
	}
	return false
}

func (p *Provider) Update(ctx context.Context, principal *backendauth.Principal, id string, params settings.UpdateSettingParams) (*settings.ProviderSetting, error) {
	if _, _, ok := parseSyntheticID(id); ok {
		return nil, bkerr.Forbidden("organization/platform provider settings are managed via Seshat Console", nil)
	}
	return p.local.Update(ctx, p.localPrincipal(principal), id, params)
}

func (p *Provider) Delete(ctx context.Context, principal *backendauth.Principal, id string) error {
	if _, _, ok := parseSyntheticID(id); ok {
		return bkerr.Forbidden("organization/platform provider settings are managed via Seshat Console", nil)
	}
	return p.local.Delete(ctx, p.localPrincipal(principal), id)
}

func (p *Provider) SetDefault(ctx context.Context, principal *backendauth.Principal, id string) (*settings.ProviderSetting, error) {
	if _, _, ok := parseSyntheticID(id); ok {
		return nil, bkerr.Forbidden("organization/platform provider settings cannot be set as your personal default", nil)
	}
	return p.local.SetDefault(ctx, p.localPrincipal(principal), id)
}

func (p *Provider) StartOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*settings.OAuthChallenge, error) {
	if _, _, ok := parseSyntheticID(id); ok {
		return nil, bkerr.Forbidden("organization/platform provider settings are managed via Seshat Console", nil)
	}
	return p.local.StartOAuth(ctx, p.localPrincipal(principal), id)
}

func (p *Provider) PollOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*settings.ProviderSetting, error) {
	if _, _, ok := parseSyntheticID(id); ok {
		return nil, bkerr.Forbidden("organization/platform provider settings are managed via Seshat Console", nil)
	}
	return p.local.PollOAuth(ctx, p.localPrincipal(principal), id)
}

func (p *Provider) DisconnectOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*settings.ProviderSetting, error) {
	if _, _, ok := parseSyntheticID(id); ok {
		return nil, bkerr.Forbidden("organization/platform provider settings are managed via Seshat Console", nil)
	}
	return p.local.DisconnectOAuth(ctx, p.localPrincipal(principal), id)
}

func (p *Provider) GetDecryptedAPIKey(ctx context.Context, principal *backendauth.Principal, id string) (string, error) {
	if tier, provider, ok := parseSyntheticID(id); ok {
		if err := backendauth.EnsureAuthenticated(principal); err != nil {
			return "", err
		}
		resolved, err := p.client.ResolveProviderSetting(ctx, principal.AuthSession.ID, principal.OrganizationID(), provider)
		if err != nil {
			return "", cloudhttp.Translate(err)
		}
		if resolved.Source != tier {
			return "", bkerr.NotFound("provider setting not found", nil)
		}
		return resolved.APIKey, nil
	}
	return p.local.GetDecryptedAPIKey(ctx, p.localPrincipal(principal), id)
}

func (p *Provider) ResolveRuntimeConfig(ctx context.Context, principal *backendauth.Principal, id string) (*settings.ResolvedProviderConfig, error) {
	if tier, provider, ok := parseSyntheticID(id); ok {
		if err := backendauth.EnsureAuthenticated(principal); err != nil {
			return nil, err
		}
		resolved, err := p.client.ResolveProviderSetting(ctx, principal.AuthSession.ID, principal.OrganizationID(), provider)
		if err != nil {
			return nil, cloudhttp.Translate(err)
		}
		if resolved.Source != tier {
			return nil, bkerr.NotFound("provider setting not found", nil)
		}
		return &settings.ResolvedProviderConfig{
			SettingID: id, Provider: resolved.Provider, AuthKind: settings.AuthKindAPIKey,
			BaseURL: resolved.BaseURL, ModelID: resolved.DefaultModel, Secret: resolved.APIKey,
		}, nil
	}
	return p.local.ResolveRuntimeConfig(ctx, p.localPrincipal(principal), id)
}

func (p *Provider) ResolveDefaultForUser(ctx context.Context, principal *backendauth.Principal) (*settings.ResolvedProviderConfig, error) {
	if resolved, err := p.local.ResolveDefaultForUser(ctx, p.localPrincipal(principal)); err != nil {
		return nil, err
	} else if resolved != nil {
		return resolved, nil
	}

	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, nil
	}
	organizationID := principal.OrganizationID()
	if organizationID == "" {
		return nil, nil
	}
	token := principal.AuthSession.ID
	for _, provider := range knownProviders {
		resolved, err := p.client.ResolveProviderSetting(ctx, token, organizationID, provider)
		if err != nil {
			continue
		}
		id := prefixOrg + resolved.Provider
		if resolved.Source == "platform" {
			id = prefixPlatform + resolved.Provider
		}
		return &settings.ResolvedProviderConfig{
			SettingID: id, Provider: resolved.Provider, AuthKind: settings.AuthKindAPIKey,
			BaseURL: resolved.BaseURL, ModelID: resolved.DefaultModel, Secret: resolved.APIKey,
		}, nil
	}
	return nil, nil
}

func parseSyntheticID(id string) (tier, provider string, ok bool) {
	if rest, found := strings.CutPrefix(id, prefixOrg); found {
		return "organization", rest, true
	}
	if rest, found := strings.CutPrefix(id, prefixPlatform); found {
		return "platform", rest, true
	}
	return "", "", false
}

func (p *Provider) localPrincipal(principal *backendauth.Principal) *backendauth.Principal {
	if principal == nil {
		return nil
	}
	scoped := *principal
	scoped.User = principal.User
	scoped.User.ID = p.localUserID(principal.User.ID)
	return &scoped
}

func (p *Provider) localUserID(userID string) string {
	sum := sha256.Sum256([]byte(p.client.serverURL + "\x00" + strings.TrimSpace(userID)))
	return "cloud:" + hex.EncodeToString(sum[:8])
}

func remoteToDisplaySetting(id, provider, defaultModel, baseURL string) settings.ProviderSetting {
	return settings.ProviderSetting{
		ID:               id,
		Provider:         provider,
		Name:             provider,
		AuthKind:         settings.AuthKindAPIKey,
		BaseURL:          baseURL,
		ModelID:          defaultModel,
		HasAPIKey:        true,
		ConnectionStatus: settings.ConnectionStatusReady,
	}
}
