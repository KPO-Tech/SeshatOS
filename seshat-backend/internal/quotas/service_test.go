package quotas

import (
	"context"
	"path/filepath"
	"testing"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

func openQuotaService(t *testing.T) (*Service, *backendauth.Principal) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	store, err := db.NewUsageCounterStore(database)
	if err != nil {
		t.Fatalf("NewUsageCounterStore: %v", err)
	}
	svc := NewService(NewLocalProvider(store))
	principal := &backendauth.Principal{User: backendauth.User{ID: "usr_testquota"}}
	return svc, principal
}

func TestNilProviderReturnsUnavailable(t *testing.T) {
	svc := NewService(nil)
	if _, err := svc.GetUsage(context.Background(), nil); err == nil {
		t.Error("expected unavailable error with nil provider")
	}
	// Increment must never fail/panic even with a nil provider.
	svc.Increment(context.Background(), nil, MetricQueries, 1)
}

func TestIncrementCreatesDayAndMonthBuckets(t *testing.T) {
	svc, principal := openQuotaService(t)
	svc.Increment(context.Background(), principal, MetricQueries, 1)

	summary, err := svc.GetUsage(context.Background(), principal)
	if err != nil {
		t.Fatalf("GetUsage: %v", err)
	}
	if len(summary.Entries) != 2 {
		t.Fatalf("expected 2 entries (day+month), got %d: %+v", len(summary.Entries), summary.Entries)
	}
}

func TestIncrementAccumulates(t *testing.T) {
	svc, principal := openQuotaService(t)
	for i := 0; i < 3; i++ {
		svc.Increment(context.Background(), principal, MetricFiles, 1)
	}
	summary, err := svc.GetUsage(context.Background(), principal)
	if err != nil {
		t.Fatalf("GetUsage: %v", err)
	}
	for _, e := range summary.Entries {
		if e.Count != 3 {
			t.Errorf("expected count=3, got %+v", e)
		}
	}
}

func TestIncrementNilPrincipalIsNoop(t *testing.T) {
	svc, _ := openQuotaService(t)
	svc.Increment(context.Background(), nil, MetricQueries, 1) // must not panic
}

func TestGetUsageRequiresAuthentication(t *testing.T) {
	svc, _ := openQuotaService(t)
	if _, err := svc.GetUsage(context.Background(), nil); err == nil {
		t.Error("expected an error without a principal")
	}
}

func TestUsageIsolatedByUser(t *testing.T) {
	svc, principal := openQuotaService(t)
	other := &backendauth.Principal{User: backendauth.User{ID: "usr_other"}}

	svc.Increment(context.Background(), principal, MetricQueries, 1)

	otherSummary, err := svc.GetUsage(context.Background(), other)
	if err != nil {
		t.Fatalf("GetUsage: %v", err)
	}
	if len(otherSummary.Entries) != 0 {
		t.Errorf("expected no entries for a different user, got %+v", otherSummary.Entries)
	}
}
