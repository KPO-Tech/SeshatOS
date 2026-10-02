package preferences

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/types"
)

func principalFor(userID string) *backendauth.Principal {
	return &backendauth.Principal{User: backendauth.User{ID: userID}}
}

func openPreferencesService(t *testing.T) *Service {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	store, err := db.NewUserPreferencesStore(database)
	if err != nil {
		t.Fatalf("NewUserPreferencesStore: %v", err)
	}
	return NewService(NewLocalProvider(store))
}

// ─── nil-store guards ─────────────────────────────────────────────────────────

func TestPreferencesNilStoreReturnsUnavailable(t *testing.T) {
	svc := NewService(nil)
	ctx := context.Background()
	principal := principalFor("usr_test")

	check := func(name string, err error) {
		t.Helper()
		if err == nil || !strings.Contains(err.Error(), "not configured") {
			t.Errorf("%s: expected unavailable error, got %v", name, err)
		}
	}

	_, err := svc.Get(ctx, principal)
	check("Get", err)

	_, err = svc.Upsert(ctx, principal, UpsertParams{})
	check("Upsert", err)
}

// ─── Get: non-existent user returns zero-value ────────────────────────────────

func TestGetNonExistentUserReturnsZeroPreferences(t *testing.T) {
	svc := openPreferencesService(t)
	prefs, err := svc.Get(context.Background(), principalFor("usr_ghost"))
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if prefs == nil {
		t.Fatal("expected non-nil prefs for unknown user")
	}
	if prefs.UserID != "usr_ghost" {
		t.Errorf("UserID: want usr_ghost, got %q", prefs.UserID)
	}
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

func TestUpsertAndGet(t *testing.T) {
	svc := openPreferencesService(t)
	ctx := context.Background()
	principal := principalFor("usr_upsert")

	saved, err := svc.Upsert(ctx, principal, UpsertParams{
		PreferredName: "Alice",
		Profession:    "Engineer",
		About:         "I build systems.",
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if saved.PreferredName != "Alice" {
		t.Errorf("PreferredName: want Alice, got %q", saved.PreferredName)
	}

	got, err := svc.Get(ctx, principal)
	if err != nil {
		t.Fatalf("Get after Upsert: %v", err)
	}
	if got.Profession != "Engineer" {
		t.Errorf("Profession: want Engineer, got %q", got.Profession)
	}
}

// ─── MaxSubAgentDepth clamping ────────────────────────────────────────────────

func TestMaxSubAgentDepthClampedAtZero(t *testing.T) {
	svc := openPreferencesService(t)
	saved, err := svc.Upsert(context.Background(), principalFor("usr_clamp_low"), UpsertParams{
		MaxSubAgentDepth: -5,
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if saved.MaxSubAgentDepth != 0 {
		t.Errorf("MaxSubAgentDepth: expected 0 for negative input, got %d", saved.MaxSubAgentDepth)
	}
}

func TestMaxSubAgentDepthClampedAtFive(t *testing.T) {
	svc := openPreferencesService(t)
	saved, err := svc.Upsert(context.Background(), principalFor("usr_clamp_high"), UpsertParams{
		MaxSubAgentDepth: 99,
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if saved.MaxSubAgentDepth != 5 {
		t.Errorf("MaxSubAgentDepth: expected 5 for input > 5, got %d", saved.MaxSubAgentDepth)
	}
}

func TestMaxSubAgentDepthValidValues(t *testing.T) {
	svc := openPreferencesService(t)
	ctx := context.Background()
	principal := principalFor("usr_depth_valid")

	for _, depth := range []int{0, 1, 2, 3, 4, 5} {
		saved, err := svc.Upsert(ctx, principal, UpsertParams{
			MaxSubAgentDepth: depth,
		})
		if err != nil {
			t.Fatalf("Upsert(depth=%d): %v", depth, err)
		}
		if saved.MaxSubAgentDepth != depth {
			t.Errorf("depth %d: expected unchanged, got %d", depth, saved.MaxSubAgentDepth)
		}
	}
}

// ─── GetMaxSubAgentDepth nil safety ───────────────────────────────────────────

func TestGetMaxSubAgentDepthNilServiceReturnsZero(t *testing.T) {
	svc := NewService(nil)
	depth, err := svc.GetMaxSubAgentDepth(context.Background(), principalFor("usr_test"))
	if err != nil || depth != 0 {
		t.Errorf("expected (0, nil), got (%d, %v)", depth, err)
	}
}

// ─── ValidatePermissionMode ───────────────────────────────────────────────────

func TestValidatePermissionModeValid(t *testing.T) {
	svc := NewService(nil)
	valid := []string{"", "onRequest", "never", "auto", "acceptEdits", "bypass", "granular"}
	for _, mode := range valid {
		if !svc.ValidatePermissionMode(mode) {
			t.Errorf("expected %q to be valid", mode)
		}
	}
}

func TestValidatePermissionModeInvalid(t *testing.T) {
	svc := NewService(nil)
	invalid := []string{"bogus", "NEVER", "on-request", "auto-edit", "yes", "1"}
	for _, mode := range invalid {
		if svc.ValidatePermissionMode(mode) {
			t.Errorf("expected %q to be invalid", mode)
		}
	}
}

// ─── ResolvePermissionModes defaults ─────────────────────────────────────────

func TestResolvePermissionModesNilServiceAutomationDefaults(t *testing.T) {
	svc := NewService(nil)
	mode, err := svc.ResolvePermissionModes(context.Background(), nil, types.ExecutionOriginAutomation)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mode != types.PermissionModeNever {
		t.Errorf("automation default: expected Never, got %q", mode)
	}
}

func TestResolvePermissionModesNilServiceInteractiveDefaults(t *testing.T) {
	svc := NewService(nil)
	mode, err := svc.ResolvePermissionModes(context.Background(), nil, types.ExecutionOriginInteractive)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mode != types.PermissionModeOnRequest {
		t.Errorf("interactive default: expected OnRequest, got %q", mode)
	}
}

func TestResolvePermissionModesNilPrincipalAutomationDefaults(t *testing.T) {
	svc := openPreferencesService(t)
	mode, err := svc.ResolvePermissionModes(context.Background(), nil, types.ExecutionOriginAutomation)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mode != types.PermissionModeNever {
		t.Errorf("nil principal + automation: expected Never, got %q", mode)
	}
}

// ─── BuildSystemPromptBlock nil safety ────────────────────────────────────────

func TestBuildSystemPromptBlockNilStoreReturnsEmpty(t *testing.T) {
	svc := NewService(nil)
	block, err := svc.BuildSystemPromptBlock(context.Background(), principalFor("usr_test"))
	if err != nil || block != "" {
		t.Errorf("expected ('', nil), got (%q, %v)", block, err)
	}
}

func TestBuildSystemPromptBlockUnknownUserReturnsEmpty(t *testing.T) {
	svc := openPreferencesService(t)
	block, err := svc.BuildSystemPromptBlock(context.Background(), principalFor("usr_ghost"))
	if err != nil || block != "" {
		t.Errorf("expected ('', nil) for unknown user, got (%q, %v)", block, err)
	}
}

// ─── principal-based permission modes ─────────────────────────────────────────

func TestResolvePermissionModesFromSavedPreferences(t *testing.T) {
	svc := openPreferencesService(t)
	ctx := context.Background()

	principal := principalFor("usr_prefs_mode")
	_, err := svc.Upsert(ctx, principal, UpsertParams{
		AutomationPermissionMode: "never",
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	mode, err := svc.ResolvePermissionModes(ctx, principal, types.ExecutionOriginAutomation)
	if err != nil {
		t.Fatalf("ResolvePermissionModes: %v", err)
	}
	if mode != types.PermissionModeNever {
		t.Errorf("expected Never from saved prefs, got %q", mode)
	}
}
