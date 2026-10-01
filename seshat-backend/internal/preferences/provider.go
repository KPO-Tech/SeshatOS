package preferences

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
)

// Provider is the preferences backend behind Service: seshat-backend's own
// local store in standalone mode (LocalProvider), or a remote seshat-server
// in connected mode (cloudpreferences.Provider) — preferences are strictly
// personal (no org/platform hierarchy, unlike provider settings), so
// "connected" simply means "stored on the server instead of locally," which
// is why they follow the user from machine to machine (see
// helps/seshat-architecture-target.md §3).
type Provider interface {
	Get(ctx context.Context, principal *backendauth.Principal) (*UserPreferences, error)
	Upsert(ctx context.Context, principal *backendauth.Principal, p UpsertParams) (*UserPreferences, error)
}
