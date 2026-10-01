package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	seshat "github.com/EngineerProjects/seshat-ai/seshat-backend/internal"
	automation "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/automation"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

// newSettingsPolicyTestApp mirrors newSkillsTestApp, plus a wired
// (possibly nil) *cloudautomation.PolicyStore - used to test
// requireSettingsWritable through a real router/HTTP round trip rather than
// calling the middleware function directly, so route wiring itself is
// covered too.
func newSettingsPolicyTestApp(t *testing.T, policies *automation.PolicyStore) (*App, string) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "settings-policy-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@settings-policy.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	}); err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	app := &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity:        identity,
			DesktopPolicies: policies,
		}),
	}
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings-policy.test", "adminpass")
	return app, token
}

func doCapabilityLinksPolicyRequest(t *testing.T, app *App, method, token string) *httptest.ResponseRecorder {
	t.Helper()
	router := CreateRouter(defaultAPIConfig, app)
	req := httptest.NewRequest(method, "/api/v1/settings/capability-links/chat_default", bytes.NewReader([]byte(`{"provider_setting_id":"anything"}`)))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestRequireSettingsWritableBlocksWriteWhenRestricted(t *testing.T) {
	policyDB, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "policies.db")))
	if err != nil {
		t.Fatalf("open policy db: %v", err)
	}
	t.Cleanup(func() { policyDB.Close() })
	policies := automation.NewPolicyStore(policyDB)
	if err := policies.Save(context.Background(), map[string]bool{automation.DesktopPolicyAllowSettingsModification: false}); err != nil {
		t.Fatalf("save: %v", err)
	}

	app, token := newSettingsPolicyTestApp(t, policies)
	rec := doCapabilityLinksPolicyRequest(t, app, http.MethodPut, token)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for a write request when settings modification is restricted, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRequireSettingsWritableAllowsReadRegardlessOfPolicy(t *testing.T) {
	policyDB, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "policies.db")))
	if err != nil {
		t.Fatalf("open policy db: %v", err)
	}
	t.Cleanup(func() { policyDB.Close() })
	policies := automation.NewPolicyStore(policyDB)
	if err := policies.Save(context.Background(), map[string]bool{automation.DesktopPolicyAllowSettingsModification: false}); err != nil {
		t.Fatalf("save: %v", err)
	}

	app, token := newSettingsPolicyTestApp(t, policies)
	rec := doCapabilityLinksPolicyRequest(t, app, http.MethodGet, token)
	if rec.Code == http.StatusForbidden {
		t.Fatalf("expected a GET request to never be blocked by the settings-modification policy, got 403: %s", rec.Body.String())
	}
}

func TestRequireSettingsWritableAllowsWriteWithoutPolicyStore(t *testing.T) {
	app, token := newSettingsPolicyTestApp(t, nil)
	rec := doCapabilityLinksPolicyRequest(t, app, http.MethodPut, token)
	if rec.Code == http.StatusForbidden {
		t.Fatalf("expected no restriction without a wired PolicyStore, got 403: %s", rec.Body.String())
	}
}

func TestRequireSettingsWritableAllowsWriteWhenNeverSynced(t *testing.T) {
	policyDB, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "policies.db")))
	if err != nil {
		t.Fatalf("open policy db: %v", err)
	}
	t.Cleanup(func() { policyDB.Close() })
	policies := automation.NewPolicyStore(policyDB)

	app, token := newSettingsPolicyTestApp(t, policies)
	rec := doCapabilityLinksPolicyRequest(t, app, http.MethodPut, token)
	if rec.Code == http.StatusForbidden {
		t.Fatalf("expected fail-open (allowed) before any policy bundle has synced, got 403: %s", rec.Body.String())
	}
}
