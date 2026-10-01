package preferences

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

// LocalProvider backs standalone mode: seshat-backend's own SQLite store.
type LocalProvider struct {
	store *db.UserPreferencesStore
}

func NewLocalProvider(store *db.UserPreferencesStore) *LocalProvider {
	return &LocalProvider{store: store}
}

func (p *LocalProvider) Get(ctx context.Context, principal *backendauth.Principal) (*UserPreferences, error) {
	if p == nil || p.store == nil {
		return nil, bkerr.Unavailable("user preferences store not available", nil)
	}
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	row, err := p.store.Get(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	if row == nil {
		return &UserPreferences{UserID: principal.User.ID}, nil
	}
	result := fromDB(row)
	return &result, nil
}

func (p *LocalProvider) Upsert(ctx context.Context, principal *backendauth.Principal, params UpsertParams) (*UserPreferences, error) {
	if p == nil || p.store == nil {
		return nil, bkerr.Unavailable("user preferences store not available", nil)
	}
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	maxDepth := params.MaxSubAgentDepth
	if maxDepth < 0 {
		maxDepth = 0
	}
	if maxDepth > 5 {
		maxDepth = 5
	}
	saved, err := p.store.Upsert(ctx, db.UpsertUserPreferencesParams{
		UserID:                    principal.User.ID,
		PreferredName:             params.PreferredName,
		Profession:                params.Profession,
		About:                     params.About,
		WorkingStyle:              params.WorkingStyle,
		ResponseStyle:             params.ResponseStyle,
		ExtraContext:              params.ExtraContext,
		InteractivePermissionMode: params.InteractivePermissionMode,
		AutomationPermissionMode:  params.AutomationPermissionMode,
		MaxSubAgentDepth:          maxDepth,
	})
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(saved)
	return &result, nil
}

func fromDB(p *db.UserPreferences) UserPreferences {
	if p == nil {
		return UserPreferences{}
	}
	return UserPreferences{
		UserID:                    p.UserID,
		PreferredName:             p.PreferredName,
		Profession:                p.Profession,
		About:                     p.About,
		WorkingStyle:              p.WorkingStyle,
		ResponseStyle:             p.ResponseStyle,
		ExtraContext:              p.ExtraContext,
		InteractivePermissionMode: p.InteractivePermissionMode,
		AutomationPermissionMode:  p.AutomationPermissionMode,
		MaxSubAgentDepth:          p.MaxSubAgentDepth,
		UpdatedAt:                 p.UpdatedAt,
	}
}
