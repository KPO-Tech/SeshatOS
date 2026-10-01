package cloudidentity

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// TestCacheRoundTripsResolvedOrganizationID is a regression test for a bug
// found live: ResolvedOrganizationID was originally tagged `json:"-"`, so it
// silently vanished every time a cached principal was written then read back
// (Cache stores principals as JSON) - correct on the very first resolution,
// then wrong on every subsequent cache hit within the freshness window. It
// must survive a Put/Get round trip.
func TestCacheRoundTripsResolvedOrganizationID(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "cache-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	cache := NewCache(database)

	principal := &auth.Principal{
		User:                   auth.User{ID: "usr_1", Email: "member@example.com"},
		AuthSession:            auth.AuthSession{ID: "token-abc", ExpiresAt: time.Now().Add(time.Hour)},
		Roles:                  []string{"admin"},
		ResolvedOrganizationID: "org_1",
	}

	if err := cache.Put(context.Background(), "token-abc", principal); err != nil {
		t.Fatalf("Put: %v", err)
	}

	cached, _, found, err := cache.Get(context.Background(), "token-abc")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !found {
		t.Fatal("expected a cache hit")
	}
	if got := cached.OrganizationID(); got != "org_1" {
		t.Fatalf("expected OrganizationID() to survive the cache round trip as 'org_1', got %q", got)
	}
}
