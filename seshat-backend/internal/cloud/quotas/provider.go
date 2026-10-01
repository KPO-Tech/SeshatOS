package cloudquotas

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/quotas"
)

// Provider implements quotas.Provider against a remote seshat-server — the
// "connected mode" quota backend.
type Provider struct {
	client *Client
}

func NewProvider(serverURL string) *Provider {
	return &Provider{client: NewClient(serverURL)}
}

var _ quotas.Provider = (*Provider)(nil)

// Increment never fails the caller — network errors are swallowed here just
// like storage errors are in quotas.LocalProvider, preserving the "quota
// tracking must never break the caller" invariant.
func (p *Provider) Increment(ctx context.Context, principal *backendauth.Principal, metric string, delta int64) {
	if principal == nil {
		return
	}
	_ = p.client.Increment(ctx, principal.AuthSession.ID, metric, delta)
}

func (p *Provider) GetUsage(ctx context.Context, principal *backendauth.Principal) (*quotas.UsageSummary, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := p.client.GetUsage(ctx, principal.AuthSession.ID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := fromRemote(*remote)
	return &result, nil
}

func fromRemote(r remoteUsageSummary) quotas.UsageSummary {
	entries := make([]quotas.UsageEntry, 0, len(r.Entries))
	for _, e := range r.Entries {
		entries = append(entries, quotas.UsageEntry{
			Metric:    e.Metric,
			Period:    e.Period,
			PeriodKey: e.PeriodKey,
			Count:     e.Count,
			UpdatedAt: e.UpdatedAt,
		})
	}
	return quotas.UsageSummary{UserID: r.UserID, Entries: entries}
}
