package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func TestAppsStrixStatusRequiresAuth(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())

	app, _ := newSkillsTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/apps/strix/status", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 with no auth, got %d body=%s", rec.Code, rec.Body.String())
	}
}

// TestAppsStrixStatusAllowsAnyAuthenticatedUser confirms this read-only
// status check uses authMiddleware, not requireRole("admin") like
// /skills/repos - a plain member gets 200, not 403.
func TestAppsStrixStatusAllowsAnyAuthenticatedUser(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())

	app, identity := newSkillsTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	memberHash, err := db.HashPassword("memberpass")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := identity.CreateUser(t.Context(), db.CreateUserParams{
		Email:        "member@strix.test",
		PasswordHash: memberHash,
		DisplayName:  "Member",
	}); err != nil {
		t.Fatalf("create member: %v", err)
	}
	memberToken := loginAs(t, router, "member@strix.test", "memberpass")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/apps/strix/status", nil)
	req.Header.Set("Authorization", "Bearer "+memberToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for a plain member, got %d body=%s", rec.Code, rec.Body.String())
	}

	var status StrixStatus
	if err := json.NewDecoder(rec.Body).Decode(&status); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	// Nothing is installed in this isolated test runtime root, and neither
	// docker nor strix are assumed present on the test runner - just check
	// internal consistency: Ready is exactly the AND of the three checks,
	// and an uninstalled skill/missing CLI reports false, not an error.
	if status.SkillInstalled {
		t.Fatalf("expected skill_installed=false in a fresh isolated runtime root, got true")
	}
	wantReady := status.SkillInstalled && status.DockerReady && status.CLIInstalled
	if status.Ready != wantReady {
		t.Fatalf("ready=%v does not match AND of prerequisites (skill=%v docker=%v cli=%v)",
			status.Ready, status.SkillInstalled, status.DockerReady, status.CLIInstalled)
	}
	if !status.CLIInstalled && status.CLIVersion != "" {
		t.Fatalf("expected empty cli_version when cli_installed=false, got %q", status.CLIVersion)
	}
}
