package memories

import (
	"context"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
)

// Provider is the flat-memory-list backend behind Service. Memories are
// strictly personal and stay on this machine, in standalone and connected
// mode alike: the only implementation is LocalProvider.
type Provider interface {
	List(ctx context.Context, principal *backendauth.Principal) ([]UserMemory, error)
	Create(ctx context.Context, principal *backendauth.Principal, p CreateParams) (*UserMemory, error)
	Update(ctx context.Context, principal *backendauth.Principal, id string, p UpdateParams) (*UserMemory, error)
	Delete(ctx context.Context, principal *backendauth.Principal, id string) error
	DeleteAll(ctx context.Context, principal *backendauth.Principal) (int64, error)
}
