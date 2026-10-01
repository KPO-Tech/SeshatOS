package audit

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type Service struct {
	store *db.AuditLogStore
}

func NewService(store *db.AuditLogStore) *Service {
	return &Service{store: store}
}

// Log records an audit event. Errors are suppressed — audit failures must never break the caller.
func (s *Service) Log(ctx context.Context, p LogParams) {
	if s == nil || s.store == nil {
		return
	}
	status := p.Status
	if status == "" {
		status = StatusSuccess
	}
	_, _ = s.store.Create(ctx, db.CreateAuditLogParams{
		ActorUserID:  p.ActorUserID,
		Action:       p.Action,
		ResourceType: p.ResourceType,
		ResourceID:   p.ResourceID,
		IPAddress:    p.IPAddress,
		Status:       status,
		Metadata:     p.Metadata,
	})
}

// List returns audit log entries. Non-admin principals are always scoped to their own entries.
func (s *Service) List(ctx context.Context, principal *backendauth.Principal, params ListParams) ([]Entry, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("audit log store not configured", nil)
	}

	actorFilter := params.ActorUserID
	if !principal.HasRole("admin") {
		actorFilter = principal.User.ID
	}

	rows, err := s.store.List(ctx, db.ListAuditLogsParams{
		ActorUserID:  actorFilter,
		Action:       params.Action,
		ResourceType: params.ResourceType,
		Limit:        params.Limit,
		Offset:       params.Offset,
	})
	if err != nil {
		return nil, bkerr.Internal("list audit logs: "+err.Error(), err)
	}
	entries := make([]Entry, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, Entry{
			ID:           row.ID,
			ActorUserID:  row.ActorUserID,
			Action:       row.Action,
			ResourceType: row.ResourceType,
			ResourceID:   row.ResourceID,
			IPAddress:    row.IPAddress,
			Status:       row.Status,
			Metadata:     row.Metadata,
			CreatedAt:    row.CreatedAt,
		})
	}
	return entries, nil
}
