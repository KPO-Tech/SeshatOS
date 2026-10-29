package preferences

import (
	"context"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/seshat-runtime/pkg/types"
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

// MemoryEnabled reports whether the user opted in to long-term memory. It is false when preferences cannot be read: memory
// stores facts from conversations, so doubt means off.
func (s *Service) MemoryEnabled(ctx context.Context, principal *backendauth.Principal) bool {
	if s == nil || s.provider == nil || principal == nil {
		return false
	}
	prefs, err := s.provider.Get(ctx, principal)
	return err == nil && prefs != nil && prefs.MemoryEnabled
}

// RichAnswersEnabled reports whether answers may use structured components. It is true unless the user turned it off, and
// stays true when preferences cannot be read: the feature is on by default.
func (s *Service) RichAnswersEnabled(ctx context.Context, principal *backendauth.Principal) bool {
	if s == nil || s.provider == nil || principal == nil {
		return true
	}
	prefs, err := s.provider.Get(ctx, principal)
	return err != nil || prefs == nil || !prefs.RichAnswersDisabled
}

func (s *Service) ValidatePermissionMode(raw string) bool {
	if raw == "" {
		return true
	}
	_, ok := types.NormalizePermissionMode(raw)
	return ok
}
