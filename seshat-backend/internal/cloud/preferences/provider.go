package cloudpreferences

import (
	"context"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/preferences"
)

// Provider implements preferences.Provider against a remote seshat-server —
// the "connected mode" preferences backend.
type Provider struct {
	client *Client
}

func NewProvider(serverURL string) *Provider {
	return &Provider{client: NewClient(serverURL)}
}

var _ preferences.Provider = (*Provider)(nil)

func (p *Provider) Get(ctx context.Context, principal *backendauth.Principal) (*preferences.UserPreferences, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := p.client.GetMyPreferences(ctx, principal.AuthSession.ID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := fromRemote(*remote)
	return &result, nil
}

func (p *Provider) Upsert(ctx context.Context, principal *backendauth.Principal, params preferences.UpsertParams) (*preferences.UserPreferences, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := p.client.UpsertMyPreferences(ctx, principal.AuthSession.ID, upsertRequest{
		PreferredName:             params.PreferredName,
		Profession:                params.Profession,
		About:                     params.About,
		WorkingStyle:              params.WorkingStyle,
		ResponseStyle:             params.ResponseStyle,
		ExtraContext:              params.ExtraContext,
		InteractivePermissionMode: params.InteractivePermissionMode,
		AutomationPermissionMode:  params.AutomationPermissionMode,
		MaxSubAgentDepth:          params.MaxSubAgentDepth,
	})
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := fromRemote(*remote)
	return &result, nil
}

func fromRemote(r remotePreferences) preferences.UserPreferences {
	return preferences.UserPreferences{
		UserID:                    r.UserID,
		PreferredName:             r.PreferredName,
		Profession:                r.Profession,
		About:                     r.About,
		WorkingStyle:              r.WorkingStyle,
		ResponseStyle:             r.ResponseStyle,
		ExtraContext:              r.ExtraContext,
		InteractivePermissionMode: r.InteractivePermissionMode,
		AutomationPermissionMode:  r.AutomationPermissionMode,
		MaxSubAgentDepth:          r.MaxSubAgentDepth,
		UpdatedAt:                 r.UpdatedAt,
	}
}
