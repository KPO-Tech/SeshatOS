package quotas

import (
	"context"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

// LocalProvider backs standalone mode: seshat-backend's own SQLite store.
type LocalProvider struct {
	store *db.UsageCounterStore
}

func NewLocalProvider(store *db.UsageCounterStore) *LocalProvider {
	return &LocalProvider{store: store}
}

// Increment adds delta (minimum 1) to both daily and monthly counters for
// (userID, metric). Errors are suppressed — quota tracking must never break
// the caller.
func (p *LocalProvider) Increment(ctx context.Context, principal *backendauth.Principal, metric string, delta int64) {
	if p == nil || p.store == nil || principal == nil {
		return
	}
	if delta <= 0 {
		delta = 1
	}
	now := time.Now().UTC()
	_ = p.store.Increment(ctx, principal.User.ID, metric, db.DayPeriodKey(now), delta)
	_ = p.store.Increment(ctx, principal.User.ID, metric, db.MonthPeriodKey(now), delta)
}

func (p *LocalProvider) GetUsage(ctx context.Context, principal *backendauth.Principal) (*UsageSummary, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if p == nil || p.store == nil {
		return nil, bkerr.Unavailable("quota store not configured", nil)
	}
	rows, err := p.store.ListByUser(ctx, principal.User.ID, "", 60)
	if err != nil {
		return nil, bkerr.Internal("list usage counters: "+err.Error(), err)
	}
	entries := make([]UsageEntry, 0, len(rows))
	for _, row := range rows {
		period := PeriodDay
		if len(row.PeriodKey) == 7 {
			period = PeriodMonth
		}
		entries = append(entries, UsageEntry{
			Metric:    row.Metric,
			Period:    period,
			PeriodKey: row.PeriodKey,
			Count:     row.Count,
			UpdatedAt: row.UpdatedAt,
		})
	}
	return &UsageSummary{UserID: principal.User.ID, Entries: entries}, nil
}
