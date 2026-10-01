package cloudautomation

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

// newTestService builds a Service backed by a single shared test database -
// NewStore/NewPolicyStore/NewVersionStore must share one *db.DB, unlike two
// independent openTestDB(t) calls which would each get their own isolated
// temp file.
func newTestService(t *testing.T) *Service {
	t.Helper()
	database := openTestDB(t)
	return NewService(NewStore(database), NewPolicyStore(database), NewVersionStore(database))
}

// newTestServiceWithPolicyStore is newTestService plus a handle onto the
// same underlying PolicyStore, for tests that need to assert what a
// heartbeat actually persisted - NewPolicyStore is a stateless wrapper
// around the shared *db.DB, so calling it twice here is safe (unlike
// calling openTestDB twice, which would open two unrelated databases).
func newTestServiceWithPolicyStore(t *testing.T) (*Service, *PolicyStore) {
	t.Helper()
	database := openTestDB(t)
	return NewService(NewStore(database), NewPolicyStore(database), NewVersionStore(database)), NewPolicyStore(database)
}

// newTestServiceWithVersionStore is newTestService plus a handle onto the
// same underlying VersionStore, for tests that need to assert what a
// heartbeat actually persisted about app-version status.
func newTestServiceWithVersionStore(t *testing.T) (*Service, *VersionStore) {
	t.Helper()
	database := openTestDB(t)
	return NewService(NewStore(database), NewPolicyStore(database), NewVersionStore(database)), NewVersionStore(database)
}

func TestStoreSaveLoadClearRoundTrip(t *testing.T) {
	ctx := context.Background()
	store := NewStore(openTestDB(t))

	loaded, err := store.Load(ctx)
	if err != nil {
		t.Fatalf("load before save: %v", err)
	}
	if loaded != nil {
		t.Fatalf("expected no connection before save, got %+v", loaded)
	}

	conn := Connection{
		ServerURL:         "https://cloud.example.com",
		DeviceID:          "dev_abc123",
		DeviceName:        "Alice's laptop",
		DeviceToken:       "raw-device-token",
		ConnectedByUserID: "usr_1",
		ConnectedAt:       time.Now().UTC().Truncate(time.Second),
	}
	if err := store.Save(ctx, conn); err != nil {
		t.Fatalf("save: %v", err)
	}

	loaded, err = store.Load(ctx)
	if err != nil {
		t.Fatalf("load after save: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected a connection after save, got nil")
	}
	if *loaded != conn {
		t.Fatalf("round-tripped connection mismatch: got %+v, want %+v", *loaded, conn)
	}

	if err := store.Clear(ctx); err != nil {
		t.Fatalf("clear: %v", err)
	}
	loaded, err = store.Load(ctx)
	if err != nil {
		t.Fatalf("load after clear: %v", err)
	}
	if loaded != nil {
		t.Fatalf("expected no connection after clear, got %+v", loaded)
	}
}

func TestStoreSaveOverwritesPreviousConnection(t *testing.T) {
	ctx := context.Background()
	store := NewStore(openTestDB(t))

	if err := store.Save(ctx, Connection{ServerURL: "https://a.example.com", DeviceToken: "tok-a"}); err != nil {
		t.Fatalf("save first: %v", err)
	}
	if err := store.Save(ctx, Connection{ServerURL: "https://b.example.com", DeviceToken: "tok-b"}); err != nil {
		t.Fatalf("save second: %v", err)
	}

	loaded, err := store.Load(ctx)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded == nil || loaded.ServerURL != "https://b.example.com" {
		t.Fatalf("expected the second connection to win, got %+v", loaded)
	}
}
