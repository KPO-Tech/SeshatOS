package plans

import (
	"context"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

type Service struct {
	store *db.PlanDocumentStore
	// approvePlan, when set, records a validated plan's approval in the agent
	// runtime, so the model's exit_plan_mode stops being refused once the user
	// has accepted the plan. Injected at construction (see app.go) to keep this
	// package independent of the runtime; a nil callback simply skips the
	// runtime record while plan documents still change status.
	approvePlan func(sessionID string)
}

func NewService(store *db.PlanDocumentStore) *Service {
	return &Service{store: store}
}

// WithApprovePlan injects the callback that records a plan's approval in the
// agent runtime, and returns the service so it can be wired in one expression.
func (s *Service) WithApprovePlan(fn func(sessionID string)) *Service {
	if s != nil {
		s.approvePlan = fn
	}
	return s
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
		// "validated" is the user approving the plan, and that same decision is
		// what the runtime gates the model's exit_plan_mode on. The plan document
		// alone is not enough: record the approval in the runtime too, or a
		// submitted plan the user accepted leaves exit_plan_mode refused.
		if *p.Status == db.PlanStatusValidated && s.approvePlan != nil {
			s.approvePlan(doc.SessionID)
		}
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
