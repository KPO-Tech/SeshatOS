package memories

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
)

// Provider is the flat-memory-list backend behind Service: seshat-backend's
// own local store in standalone mode (LocalProvider), or a remote
// seshat-server in connected mode (cloudmemories.Provider) — memories are
// strictly personal (no org/platform hierarchy), so "connected" simply
// means "stored on the server instead of locally," the same shape as
// preferences (see helps/seshat-architecture-target.md §3).
type Provider interface {
	List(ctx context.Context, principal *backendauth.Principal) ([]UserMemory, error)
	Create(ctx context.Context, principal *backendauth.Principal, p CreateParams) (*UserMemory, error)
	Update(ctx context.Context, principal *backendauth.Principal, id string, p UpdateParams) (*UserMemory, error)
	Delete(ctx context.Context, principal *backendauth.Principal, id string) error
	DeleteAll(ctx context.Context, principal *backendauth.Principal) (int64, error)
}
