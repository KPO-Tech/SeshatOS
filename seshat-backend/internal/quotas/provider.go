package quotas

import (
	"context"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
)

// Provider is the quota backend behind Service: seshat-backend's own local
// store in standalone mode (LocalProvider), or a remote seshat-server in
// connected mode (cloudquotas.Provider) — usage counters are strictly
// personal (no org/platform hierarchy) and purely descriptive, never an
// enforced limit, so "connected" simply means "counted on the server
// instead of locally" (see helps/seshat-architecture-target.md §7).
type Provider interface {
	// Increment must never fail the caller — quota tracking is best-effort
	// bookkeeping, not a gate. Implementations swallow their own errors.
	Increment(ctx context.Context, principal *backendauth.Principal, metric string, delta int64)
	GetUsage(ctx context.Context, principal *backendauth.Principal) (*UsageSummary, error)
}
