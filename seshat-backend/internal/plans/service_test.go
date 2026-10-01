package plans

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func openPlansService(t *testing.T) (*Service, *db.PlanDocumentStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	store, err := db.NewPlanDocumentStore(database)
	if err != nil {
		t.Fatalf("NewPlanDocumentStore: %v", err)
	}
	return NewService(store), store
}

func makePrincipal(userID string) *backendauth.Principal {
	return &backendauth.Principal{User: backendauth.User{ID: userID}}
}

// ─── nil-store guards ─────────────────────────────────────────────────────────

func TestPlansNilStoreReturnsUnavailable(t *testing.T) {
	svc := NewService(nil)
	ctx := context.Background()
	principal := makePrincipal("usr_test")

	check := func(name string, err error) {
		t.Helper()
		if err == nil || !strings.Contains(err.Error(), "not available") {
			t.Errorf("%s: expected unavailable error, got %v", name, err)
		}
	}

	_, err := svc.ListBySession(ctx, principal, "sess_1")
	check("ListBySession", err)

	_, err = svc.Get(ctx, principal, "pln_1")
	check("Get", err)

	_, err = svc.Patch(ctx, principal, "pln_1", PatchParams{})
	check("Patch", err)
}

// ─── ListBySession validation ─────────────────────────────────────────────────

func TestListBySessionEmptyIDReturnsInvalidInput(t *testing.T) {
	svc, _ := openPlansService(t)
	_, err := svc.ListBySession(context.Background(), makePrincipal("usr_test"), "")
	if err == nil {
		t.Fatal("expected error for empty session ID")
	}
	if bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Errorf("expected InvalidInput, got %v", err)
	}
}

func TestListBySessionWhitespaceIDReturnsInvalidInput(t *testing.T) {
	svc, _ := openPlansService(t)
	_, err := svc.ListBySession(context.Background(), makePrincipal("usr_test"), "   ")
	if err == nil || bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Errorf("expected InvalidInput for whitespace session ID, got %v", err)
	}
}

// ─── Get: not found ───────────────────────────────────────────────────────────

func TestGetNonExistentPlanReturnsNotFound(t *testing.T) {
	svc, _ := openPlansService(t)
	_, err := svc.Get(context.Background(), makePrincipal("usr_test"), "pln_nonexistent")
	if err == nil {
		t.Fatal("expected error for non-existent plan")
	}
	if bkerr.KindOf(err) != bkerr.ErrorKindNotFound {
		t.Errorf("expected NotFound, got %v (kind=%v)", err, bkerr.KindOf(err))
	}
}

// ─── Get: ownership ───────────────────────────────────────────────────────────

func TestGetForbiddenForDifferentUser(t *testing.T) {
	svc, store := openPlansService(t)
	ctx := context.Background()

	owner := makePrincipal("usr_owner")
	attacker := makePrincipal("usr_attacker")

	// Create a plan belonging to owner.
	doc, err := store.Create(ctx, db.CreatePlanParams{
		SessionID: "sess_abc",
		UserID:    owner.User.ID,
		Slug:      "plan",
		Filename:  "PLAN.md",
		Content:   "## Plan",
	})
	if err != nil {
		t.Fatalf("store.Create: %v", err)
	}

	_, err = svc.Get(ctx, attacker, doc.ID)
	if err == nil {
		t.Fatal("expected error when accessing another user's plan")
	}
	if bkerr.KindOf(err) != bkerr.ErrorKindForbidden {
		t.Errorf("expected Forbidden, got %v (kind=%v)", err, bkerr.KindOf(err))
	}
}

// ─── CRUD happy path ──────────────────────────────────────────────────────────

func TestPlanCreateGetList(t *testing.T) {
	svc, store := openPlansService(t)
	ctx := context.Background()
	principal := makePrincipal("usr_crud")

	doc, err := store.Create(ctx, db.CreatePlanParams{
		SessionID: "sess_xyz",
		UserID:    principal.User.ID,
		Slug:      "my-plan",
		Filename:  "PLAN.md",
		Content:   "initial content",
	})
	if err != nil {
		t.Fatalf("store.Create: %v", err)
	}

	got, err := svc.Get(ctx, principal, doc.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Content != "initial content" {
		t.Errorf("Content: want 'initial content', got %q", got.Content)
	}

	list, err := svc.ListBySession(ctx, principal, "sess_xyz")
	if err != nil {
		t.Fatalf("ListBySession: %v", err)
	}
	if len(list) != 1 || list[0].ID != doc.ID {
		t.Errorf("ListBySession: expected 1 plan, got %d", len(list))
	}
}

func TestPlanListIsolatedByUser(t *testing.T) {
	svc, store := openPlansService(t)
	ctx := context.Background()

	userA := makePrincipal("usr_a")
	userB := makePrincipal("usr_b")

	_, _ = store.Create(ctx, db.CreatePlanParams{SessionID: "sess_1", UserID: userA.User.ID, Slug: "a-plan"})
	_, _ = store.Create(ctx, db.CreatePlanParams{SessionID: "sess_1", UserID: userB.User.ID, Slug: "b-plan"})

	listA, _ := svc.ListBySession(ctx, userA, "sess_1")
	if len(listA) != 1 {
		t.Errorf("userA should see only 1 plan, got %d", len(listA))
	}
	if listA[0].UserID != userA.User.ID {
		t.Errorf("plan belongs to wrong user: %s", listA[0].UserID)
	}
}

func TestPlanPatchContent(t *testing.T) {
	svc, store := openPlansService(t)
	ctx := context.Background()
	principal := makePrincipal("usr_patch")

	doc, _ := store.Create(ctx, db.CreatePlanParams{
		SessionID: "sess_p",
		UserID:    principal.User.ID,
		Slug:      "patchable",
		Content:   "old",
	})

	newContent := "updated content"
	updated, err := svc.Patch(ctx, principal, doc.ID, PatchParams{Content: &newContent})
	if err != nil {
		t.Fatalf("Patch: %v", err)
	}
	if updated.Content != "updated content" {
		t.Errorf("Content: want 'updated content', got %q", updated.Content)
	}
}

func TestPlanPatchStatus(t *testing.T) {
	svc, store := openPlansService(t)
	ctx := context.Background()
	principal := makePrincipal("usr_status")

	doc, _ := store.Create(ctx, db.CreatePlanParams{
		SessionID: "sess_s",
		UserID:    principal.User.ID,
		Slug:      "status-plan",
	})

	status := "completed"
	updated, err := svc.Patch(ctx, principal, doc.ID, PatchParams{Status: &status})
	if err != nil {
		t.Fatalf("Patch status: %v", err)
	}
	if updated.Status != "completed" {
		t.Errorf("Status: want 'completed', got %q", updated.Status)
	}
}

func TestPlanPatchForbiddenForDifferentUser(t *testing.T) {
	svc, store := openPlansService(t)
	ctx := context.Background()

	owner := makePrincipal("usr_owner2")
	attacker := makePrincipal("usr_attacker2")

	doc, _ := store.Create(ctx, db.CreatePlanParams{
		SessionID: "sess_q",
		UserID:    owner.User.ID,
		Slug:      "protected",
	})

	newContent := "evil"
	_, err := svc.Patch(ctx, attacker, doc.ID, PatchParams{Content: &newContent})
	if err == nil || bkerr.KindOf(err) != bkerr.ErrorKindForbidden {
		t.Errorf("expected Forbidden when patching another user's plan, got %v", err)
	}
}
