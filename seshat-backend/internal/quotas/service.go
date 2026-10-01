package quotas

import (
	"context"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

// Service is a thin orchestrator over an injected Provider (local or remote
// depending on mode) — same pattern as internal/preferences.Service.
type Service struct {
	provider Provider
}

func NewService(provider Provider) *Service {
	return &Service{provider: provider}
}

// Increment adds delta (minimum 1) to the counters for (principal, metric).
// Never fails the caller — see Provider's doc comment.
func (s *Service) Increment(ctx context.Context, principal *backendauth.Principal, metric string, delta int64) {
	if s == nil || s.provider == nil {
		return
	}
	s.provider.Increment(ctx, principal, metric, delta)
}

// GetUsage returns all usage counters for the authenticated user.
func (s *Service) GetUsage(ctx context.Context, principal *backendauth.Principal) (*UsageSummary, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("quota store not configured", nil)
	}
	return s.provider.GetUsage(ctx, principal)
}
