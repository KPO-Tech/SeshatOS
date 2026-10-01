package plans

import (
	"context"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type Service struct {
	store *db.PlanDocumentStore
}

func NewService(store *db.PlanDocumentStore) *Service {
	return &Service{store: store}
}

func (s *Service) ListBySession(ctx context.Context, principal *backendauth.Principal, sessionID string) ([]Plan, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("plan store not available", nil)
	}
	if strings.TrimSpace(sessionID) == "" {
		return nil, bkerr.InvalidInput("session_id is required", nil)
	}
	rows, err := s.store.ListBySessionAndUser(ctx, sessionID, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	out := make([]Plan, 0, len(rows))
	for _, p := range rows {
		out = append(out, fromDB(p))
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, principal *backendauth.Principal, planID string) (*Plan, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("plan store not available", nil)
	}
	doc, err := s.store.Get(ctx, planID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	if doc == nil {
		return nil, bkerr.NotFound("plan not found", nil)
	}
	if doc.UserID != principal.User.ID {
		return nil, bkerr.Forbidden("access denied", nil)
	}
	result := fromDB(doc)
	return &result, nil
}

func (s *Service) Patch(ctx context.Context, principal *backendauth.Principal, planID string, p PatchParams) (*Plan, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("plan store not available", nil)
	}
	doc, err := s.store.Get(ctx, planID)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	if doc == nil {
		return nil, bkerr.NotFound("plan not found", nil)
	}
	if doc.UserID != principal.User.ID {
		return nil, bkerr.Forbidden("access denied", nil)
	}
	if p.Content != nil {
		doc, err = s.store.UpdateContent(ctx, planID, *p.Content)
		if err != nil {
			return nil, bkerr.Internal(err.Error(), err)
		}
	}
	if p.Status != nil {
		if err := s.store.SetStatus(ctx, planID, *p.Status); err != nil {
			return nil, bkerr.Internal(err.Error(), err)
		}
		doc.Status = *p.Status
	}
	result := fromDB(doc)
	return &result, nil
}

func fromDB(p *db.PlanDocument) Plan {
	return Plan{
		ID:        p.ID,
		SessionID: p.SessionID,
		UserID:    p.UserID,
		Slug:      p.Slug,
		Filename:  p.Filename,
		Content:   p.Content,
		Status:    p.Status,
		Version:   p.Version,
		CreatedAt: p.CreatedAt,
		UpdatedAt: p.UpdatedAt,
	}
}
