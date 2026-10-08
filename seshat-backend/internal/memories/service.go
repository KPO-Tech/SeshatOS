package memories

import (
	"context"
	"time"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
	"github.com/KPO-Tech/seshat/pkg/types"
)

type Service struct {
	provider Provider
	// longTermStore is longterm.Store, the SDK's own interface; the backend
	// passes the local *db.LongTermMemoryStore.
	longTermStore longterm.Store
	extractor     *longterm.Extractor
}

func NewService(provider Provider, longTermStore longterm.Store, extractor *longterm.Extractor) *Service {
	return &Service{provider: provider, longTermStore: longTermStore, extractor: extractor}
}

func (s *Service) List(ctx context.Context, principal *backendauth.Principal) ([]UserMemory, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("memory store not available", nil)
	}
	return s.provider.List(ctx, principal)
}

func (s *Service) Create(ctx context.Context, principal *backendauth.Principal, p CreateParams) (*UserMemory, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("memory store not available", nil)
	}
	return s.provider.Create(ctx, principal, p)
}

func (s *Service) Update(ctx context.Context, principal *backendauth.Principal, id string, p UpdateParams) (*UserMemory, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("memory store not available", nil)
	}
	return s.provider.Update(ctx, principal, id, p)
}

func (s *Service) Delete(ctx context.Context, principal *backendauth.Principal, id string) error {
	if s == nil || s.provider == nil {
		return bkerr.Unavailable("memory store not available", nil)
	}
	return s.provider.Delete(ctx, principal, id)
}

func (s *Service) DeleteAll(ctx context.Context, principal *backendauth.Principal) (int64, error) {
	if s == nil || s.provider == nil {
		return 0, bkerr.Unavailable("memory store not available", nil)
	}
	return s.provider.DeleteAll(ctx, principal)
}

func (s *Service) BuildContextBlock(ctx context.Context, principal *backendauth.Principal, prompt string) (string, error) {
	if s == nil || s.longTermStore == nil || principal == nil {
		return "", nil
	}
	const maxTokens = 500
	block, err := s.longTermStore.RetrieveForContext(ctx, principal.User.ID, prompt, maxTokens)
	if err != nil {
		return "", nil
	}
	return block, nil
}

func (s *Service) TriggerExtraction(principal *backendauth.Principal, messages []types.Message) {
	if s == nil || s.extractor == nil || principal == nil || len(messages) == 0 {
		return
	}
	userID := principal.User.ID
	msgs := messages
	go func() {
		// A fresh background context, not derived from the request's own
		// (which will already be cancelled by the time this async
		// extraction runs).
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		_ = s.extractor.Extract(ctx, userID, msgs)
	}()
}
