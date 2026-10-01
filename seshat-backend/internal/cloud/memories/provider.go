package cloudmemories

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/memories"
)

// Provider implements memories.Provider against a remote seshat-server —
// the "connected mode" flat-memory-list backend.
type Provider struct {
	client *Client
}

func NewProvider(serverURL string) *Provider {
	return &Provider{client: NewClient(serverURL)}
}

var _ memories.Provider = (*Provider)(nil)

func (p *Provider) List(ctx context.Context, principal *backendauth.Principal) ([]memories.UserMemory, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	rows, err := p.client.List(ctx, principal.AuthSession.ID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	out := make([]memories.UserMemory, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromRemote(r))
	}
	return out, nil
}

func (p *Provider) Create(ctx context.Context, principal *backendauth.Principal, params memories.CreateParams) (*memories.UserMemory, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := p.client.Create(ctx, principal.AuthSession.ID, createRequest{
		Type: params.Type, Key: params.Key, Value: params.Value,
		Importance: params.Importance, Source: params.Source,
	})
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := fromRemote(*remote)
	return &result, nil
}

func (p *Provider) Update(ctx context.Context, principal *backendauth.Principal, id string, params memories.UpdateParams) (*memories.UserMemory, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := p.client.Update(ctx, principal.AuthSession.ID, id, updateRequest{
		Type: params.Type, Key: params.Key, Value: params.Value,
		Importance: params.Importance, Source: params.Source,
	})
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := fromRemote(*remote)
	return &result, nil
}

func (p *Provider) Delete(ctx context.Context, principal *backendauth.Principal, id string) error {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return err
	}
	if err := p.client.Delete(ctx, principal.AuthSession.ID, id); err != nil {
		return cloudhttp.Translate(err)
	}
	return nil
}

func (p *Provider) DeleteAll(ctx context.Context, principal *backendauth.Principal) (int64, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return 0, err
	}
	n, err := p.client.DeleteAll(ctx, principal.AuthSession.ID)
	if err != nil {
		return 0, cloudhttp.Translate(err)
	}
	return n, nil
}

func fromRemote(r remoteMemory) memories.UserMemory {
	return memories.UserMemory{
		ID: r.ID, UserID: r.UserID, Type: r.Type, Key: r.Key, Value: r.Value,
		Importance: r.Importance, Source: r.Source, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}
