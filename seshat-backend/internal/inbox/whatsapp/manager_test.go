package whatsapp

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "github.com/glebarez/go-sqlite"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
)

func testSQLDB(t *testing.T) *sql.DB {
	t.Helper()
	// whatsmeow's schema uses foreign keys, off by default in SQLite - the
	// production path gets this from internal/db's own configure() (see
	// its PRAGMA foreign_keys = ON), which already runs before this
	// package's NewManager ever sees the shared *sql.DB.
	dsn := filepath.Join(t.TempDir(), "whatsmeow-test.db") + "?_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func noopIngest(_ context.Context, _ string, _ inbox.NormalizedMessage) error { return nil }
func noopSetStatus(_ context.Context, _, _, _ string) error                   { return nil }

func TestNewManager_UpgradesSchemaOnASharedSQLiteDB(t *testing.T) {
	sqlDB := testSQLDB(t)
	m, err := NewManager(context.Background(), sqlDB, "sqlite", noopIngest, noopSetStatus)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	if m == nil {
		t.Fatal("expected a non-nil manager")
	}
}

func TestManager_ReconnectFailsClearlyForUnknownJID(t *testing.T) {
	sqlDB := testSQLDB(t)
	m, err := NewManager(context.Background(), sqlDB, "sqlite", noopIngest, noopSetStatus)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	err = m.Reconnect(context.Background(), "acc-1", "15551234567@s.whatsapp.net")
	if err == nil {
		t.Fatal("expected an error reconnecting a JID with no stored session")
	}
}

func TestManager_ReconnectFailsClearlyForMalformedJID(t *testing.T) {
	sqlDB := testSQLDB(t)
	m, err := NewManager(context.Background(), sqlDB, "sqlite", noopIngest, noopSetStatus)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	if err := m.Reconnect(context.Background(), "acc-1", "not a jid"); err == nil {
		t.Fatal("expected an error for a malformed JID")
	}
}

func TestManager_SendFailsClearlyWhenAccountNotConnected(t *testing.T) {
	sqlDB := testSQLDB(t)
	m, err := NewManager(context.Background(), sqlDB, "sqlite", noopIngest, noopSetStatus)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	if _, err := m.Send(context.Background(), "acc-not-connected", "15551234567@s.whatsapp.net", "hello"); err == nil {
		t.Fatal("expected an error sending through an unconnected account")
	}
}

func TestManager_DisconnectAndDisconnectAllAreSafeOnEmptyState(t *testing.T) {
	sqlDB := testSQLDB(t)
	m, err := NewManager(context.Background(), sqlDB, "sqlite", noopIngest, noopSetStatus)
	if err != nil {
		t.Fatalf("NewManager: %v", err)
	}
	m.Disconnect("nonexistent")
	m.DisconnectAll()
}
