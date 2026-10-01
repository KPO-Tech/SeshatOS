package preferences

import (
	"context"
	"fmt"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/seshat/pkg/types"
)

// Service is a thin orchestrator over an injected Provider (local or remote
// depending on mode). BuildSystemPromptBlock/ResolvePermissionModes/
// GetMaxSubAgentDepth are derived views computed from Provider.Get's result,
// not separate storage calls — this is what makes them work identically
// regardless of which Provider is wired in.
type Service struct {
	provider Provider
}

func NewService(provider Provider) *Service {
	return &Service{provider: provider}
}

func (s *Service) Get(ctx context.Context, principal *backendauth.Principal) (*UserPreferences, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("preferences not configured", nil)
	}
	return s.provider.Get(ctx, principal)
}

func (s *Service) Upsert(ctx context.Context, principal *backendauth.Principal, p UpsertParams) (*UserPreferences, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("preferences not configured", nil)
	}
	return s.provider.Upsert(ctx, principal, p)
}

func (s *Service) BuildSystemPromptBlock(ctx context.Context, principal *backendauth.Principal) (string, error) {
	if s == nil || s.provider == nil || principal == nil {
		return "", nil
	}
	prefs, err := s.provider.Get(ctx, principal)
	if err != nil || prefs == nil {
		return "", nil
	}
	return prefs.BuildSystemPromptBlock(), nil
}

func (s *Service) ResolvePermissionModes(ctx context.Context, principal *backendauth.Principal, origin types.ExecutionOrigin) (types.PermissionMode, error) {
	fallback := func() types.PermissionMode {
		if origin == types.ExecutionOriginAutomation {
			return types.PermissionModeNever
		}
		return types.PermissionModeOnRequest
	}
	if s == nil || s.provider == nil || principal == nil {
		return fallback(), nil
	}
	prefs, err := s.provider.Get(ctx, principal)
	if err != nil || prefs == nil {
		return fallback(), nil
	}
	if origin == types.ExecutionOriginAutomation {
		return prefs.PreferredAutomationPermissionMode(), nil
	}
	return prefs.PreferredInteractivePermissionMode(), nil
}

func (s *Service) GetMaxSubAgentDepth(ctx context.Context, principal *backendauth.Principal) (int, error) {
	if s == nil || s.provider == nil || principal == nil {
		return 0, nil
	}
	prefs, err := s.provider.Get(ctx, principal)
	if err != nil || prefs == nil || prefs.MaxSubAgentDepth <= 0 {
		return 0, nil
	}
	return prefs.MaxSubAgentDepth, nil
}

func (s *Service) ValidatePermissionMode(raw string) bool {
	if raw == "" {
		return true
	}
	_, ok := types.NormalizePermissionMode(raw)
	return ok
}

// ParsePermissionMode is a helper used by HTTP handlers.
func ParsePermissionMode(raw string) (types.PermissionMode, bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", false, nil
	}
	mode, ok := types.NormalizePermissionMode(trimmed)
	if !ok {
		return "", false, fmt.Errorf("invalid permission_mode %q", raw)
	}
	return mode, true, nil
}
