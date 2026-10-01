package memories

import (
	"context"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

// LocalProvider backs standalone mode: seshat-backend's own SQLite store.
// Behavior-preserving move of what used to be Service's own logic.
type LocalProvider struct {
	store *db.UserMemoryStore
}

func NewLocalProvider(store *db.UserMemoryStore) *LocalProvider {
	return &LocalProvider{store: store}
}

func (p *LocalProvider) List(ctx context.Context, principal *backendauth.Principal) ([]UserMemory, error) {
	if p == nil || p.store == nil {
		return nil, bkerr.Unavailable("memory store not available", nil)
	}
	rows, err := p.store.List(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	out := make([]UserMemory, 0, len(rows))
	for _, m := range rows {
		out = append(out, fromDB(m))
	}
	return out, nil
}

func (p *LocalProvider) Create(ctx context.Context, principal *backendauth.Principal, params CreateParams) (*UserMemory, error) {
	if p == nil || p.store == nil {
		return nil, bkerr.Unavailable("memory store not available", nil)
	}
	if strings.TrimSpace(params.Key) == "" {
		return nil, bkerr.InvalidInput("key is required", nil)
	}
	if len(params.Key) > 255 {
		return nil, bkerr.InvalidInput("key exceeds maximum length (255 chars)", nil)
	}
	if len(params.Value) > 4096 {
		return nil, bkerr.InvalidInput("value exceeds maximum length (4096 chars)", nil)
	}
	m, err := p.store.Create(ctx, db.CreateUserMemoryParams{
		UserID:     principal.User.ID,
		Type:       params.Type,
		Key:        params.Key,
		Value:      params.Value,
		Importance: params.Importance,
		Source:     params.Source,
	})
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*m)
	return &result, nil
}

func (p *LocalProvider) Update(ctx context.Context, principal *backendauth.Principal, id string, params UpdateParams) (*UserMemory, error) {
	if p == nil || p.store == nil {
		return nil, bkerr.Unavailable("memory store not available", nil)
	}
	m, err := p.store.Update(ctx, principal.User.ID, id, db.UpdateUserMemoryParams{
		Type:       params.Type,
		Key:        params.Key,
		Value:      params.Value,
		Importance: params.Importance,
		Source:     params.Source,
	})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, bkerr.NotFound("memory not found", err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*m)
	return &result, nil
}

func (p *LocalProvider) Delete(ctx context.Context, principal *backendauth.Principal, id string) error {
	if p == nil || p.store == nil {
		return bkerr.Unavailable("memory store not available", nil)
	}
	if err := p.store.Delete(ctx, principal.User.ID, id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return bkerr.NotFound("memory not found", err)
		}
		return bkerr.Internal(err.Error(), err)
	}
	return nil
}

func (p *LocalProvider) DeleteAll(ctx context.Context, principal *backendauth.Principal) (int64, error) {
	if p == nil || p.store == nil {
		return 0, bkerr.Unavailable("memory store not available", nil)
	}
	n, err := p.store.DeleteAll(ctx, principal.User.ID)
	if err != nil {
		return 0, bkerr.Internal(err.Error(), err)
	}
	return n, nil
}

func fromDB(m db.UserMemory) UserMemory {
	return UserMemory{
		ID:         m.ID,
		UserID:     m.UserID,
		Type:       m.Type,
		Key:        m.Key,
		Value:      m.Value,
		Importance: m.Importance,
		Source:     m.Source,
		CreatedAt:  m.CreatedAt,
		UpdatedAt:  m.UpdatedAt,
	}
}
