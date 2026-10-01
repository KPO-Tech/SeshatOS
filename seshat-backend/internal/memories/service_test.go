package memories

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// openMemoriesService opens a real SQLite test DB and returns a ready Service
// and a test Principal. The DB is closed automatically when the test ends.
func openMemoriesService(t *testing.T) (*Service, *backendauth.Principal) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	store, err := db.NewUserMemoryStore(database)
	if err != nil {
		t.Fatalf("NewUserMemoryStore: %v", err)
	}
	svc := NewService(NewLocalProvider(store), nil, nil)
	principal := &backendauth.Principal{User: backendauth.User{ID: "usr_testmemory"}}
	return svc, principal
}

// ─── nil-store guards ─────────────────────────────────────────────────────────

func TestMemoriesNilStoreReturnsUnavailable(t *testing.T) {
	svc := NewService(nil, nil, nil)
	ctx := context.Background()
	principal := &backendauth.Principal{User: backendauth.User{ID: "usr_test"}}

	check := func(name string, err error) {
		t.Helper()
		if err == nil || !strings.Contains(err.Error(), "not available") {
			t.Errorf("%s: expected unavailable error, got %v", name, err)
		}
	}

	_, err := svc.List(ctx, principal)
	check("List", err)

	_, err = svc.Create(ctx, principal, CreateParams{Key: "k", Value: "v"})
	check("Create", err)

	_, err = svc.Update(ctx, principal, "mem_x", UpdateParams{})
	check("Update", err)

	check("Delete", svc.Delete(ctx, principal, "mem_x"))
	_, err = svc.DeleteAll(ctx, principal)
	check("DeleteAll", err)
}

// ─── key/value validation ─────────────────────────────────────────────────────

func TestCreateKeyEmpty(t *testing.T) {
	svc, principal := openMemoriesService(t)
	_, err := svc.Create(context.Background(), principal, CreateParams{Key: "  ", Value: "v"})
	if err == nil || !strings.Contains(err.Error(), "key is required") {
		t.Errorf("expected 'key is required', got %v", err)
	}
}

func TestCreateKeyTooLong(t *testing.T) {
	svc, principal := openMemoriesService(t)
	longKey := strings.Repeat("k", 256)
	_, err := svc.Create(context.Background(), principal, CreateParams{Key: longKey, Value: "v"})
	if err == nil || !strings.Contains(err.Error(), "255") {
		t.Errorf("expected max-length error for key > 255, got %v", err)
	}
}

func TestCreateValueTooLong(t *testing.T) {
	svc, principal := openMemoriesService(t)
	longVal := strings.Repeat("v", 4097)
	_, err := svc.Create(context.Background(), principal, CreateParams{Key: "k", Value: longVal})
	if err == nil || !strings.Contains(err.Error(), "4096") {
		t.Errorf("expected max-length error for value > 4096, got %v", err)
	}
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

func TestMemoriesCreateAndList(t *testing.T) {
	svc, principal := openMemoriesService(t)
	ctx := context.Background()

	m, err := svc.Create(ctx, principal, CreateParams{Key: "language", Value: "Go", Type: "fact"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if m.Key != "language" || m.Value != "Go" {
		t.Errorf("Create: unexpected result %+v", m)
	}

	all, err := svc.List(ctx, principal)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 1 || all[0].ID != m.ID {
		t.Errorf("List: expected 1 memory, got %d", len(all))
	}
}

func TestMemoriesDelete(t *testing.T) {
	svc, principal := openMemoriesService(t)
	ctx := context.Background()

	m, _ := svc.Create(ctx, principal, CreateParams{Key: "x", Value: "y"})
	if err := svc.Delete(ctx, principal, m.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	all, _ := svc.List(ctx, principal)
	if len(all) != 0 {
		t.Errorf("expected empty list after delete, got %d", len(all))
	}
}

func TestMemoriesDeleteAll(t *testing.T) {
	svc, principal := openMemoriesService(t)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		_, _ = svc.Create(ctx, principal, CreateParams{Key: "k" + string(rune('0'+i)), Value: "v"})
	}
	n, err := svc.DeleteAll(ctx, principal)
	if err != nil {
		t.Fatalf("DeleteAll: %v", err)
	}
	if n != 3 {
		t.Errorf("DeleteAll: expected 3, got %d", n)
	}
}

func TestMemoriesIsolatedByUser(t *testing.T) {
	svc, principal := openMemoriesService(t)
	ctx := context.Background()

	otherPrincipal := &backendauth.Principal{User: backendauth.User{ID: "usr_other"}}
	_, _ = svc.Create(ctx, principal, CreateParams{Key: "mine", Value: "yes"})
	_, _ = svc.Create(ctx, otherPrincipal, CreateParams{Key: "theirs", Value: "no"})

	mine, _ := svc.List(ctx, principal)
	if len(mine) != 1 || mine[0].Key != "mine" {
		t.Errorf("List should be isolated by user, got %+v", mine)
	}
}

// ─── BuildContextBlock nil safety ─────────────────────────────────────────────

func TestBuildContextBlockNilServiceReturnsEmpty(t *testing.T) {
	var svc *Service
	block, err := svc.BuildContextBlock(context.Background(), nil, "prompt")
	if err != nil || block != "" {
		t.Errorf("expected ('', nil), got (%q, %v)", block, err)
	}
}

func TestBuildContextBlockNilLongTermStoreReturnsEmpty(t *testing.T) {
	svc := NewService(nil, nil, nil) // longTermStore is nil
	principal := &backendauth.Principal{User: backendauth.User{ID: "usr_test"}}
	block, err := svc.BuildContextBlock(context.Background(), principal, "prompt")
	if err != nil || block != "" {
		t.Errorf("expected ('', nil), got (%q, %v)", block, err)
	}
}

// ─── TriggerExtraction nil safety ─────────────────────────────────────────────

func TestTriggerExtractionNilSafe(t *testing.T) {
	// None of these should panic.
	var svc *Service
	svc.TriggerExtraction(nil, nil)

	svc2 := NewService(nil, nil, nil)
	svc2.TriggerExtraction(nil, nil)
}
