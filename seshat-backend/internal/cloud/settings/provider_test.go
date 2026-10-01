package cloudsettings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	backendsettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
)

func principalWithOrg(orgID string) *backendauth.Principal {
	return &backendauth.Principal{
		User:        backendauth.User{ID: "usr_1", Email: "member@example.com"},
		AuthSession: backendauth.AuthSession{ID: "token123"},
		Roles:       []string{"member"},
		WorkspaceMemberships: []backendauth.WorkspaceMembership{
			{WorkspaceID: "ws_1", OrganizationID: orgID, Role: "member"},
		},
	}
}

// TestResolveDefaultForUserFallsBackToOrgProvider is a regression test for
// the onboarding gap this session found: a freshly connected-mode account
// with zero personal provider keys used to silently resolve to nothing (and
// therefore the backend's own unconfigured env vars) even when the
// organization already has a provider configured in Seshat Console. It must
// now pick up the org's first configured provider automatically.
func TestResolveDefaultForUserFallsBackToOrgProvider(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("provider") != "anthropic" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(ResolvedProviderSetting{
			Provider: "anthropic", DefaultModel: "claude-opus-4-8", APIKey: "sk-secret", Source: "organization",
		})
	}))
	defer srv.Close()

	p := NewProvider(srv.URL, nil, nil)
	principal := principalWithOrg("org_1")

	resolved, err := p.ResolveDefaultForUser(context.Background(), principal)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resolved == nil {
		t.Fatal("expected a resolved provider config, got nil")
	}
	if resolved.Provider != "anthropic" || resolved.Secret != "sk-secret" {
		t.Errorf("unexpected resolved config: %+v", resolved)
	}
	if resolved.SettingID != "org:anthropic" {
		t.Errorf("expected synthetic org setting id, got %q", resolved.SettingID)
	}
}

func TestResolveDefaultForUserReturnsNilWithoutOrganization(t *testing.T) {
	p := NewProvider("http://unused.invalid", nil, nil)
	principal := &backendauth.Principal{
		User:        backendauth.User{ID: "usr_2", Email: "admin@example.com"},
		AuthSession: backendauth.AuthSession{ID: "token456"},
		Roles:       []string{"admin"},
	}

	resolved, err := p.ResolveDefaultForUser(context.Background(), principal)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resolved != nil {
		t.Errorf("expected nil for a caller with no organization membership, got %+v", resolved)
	}
}

func TestListScopesLocalPersonalSettingsForConnectedUser(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "settings.db")))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	store, err := db.NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("new provider setting store: %v", err)
	}

	if _, err := store.Create(ctx, db.CreateProviderSettingParams{
		UserID: "usr_1", Provider: "codex", Name: "Codex (OAuth)", AuthKind: backendsettings.AuthKindOAuth,
	}); err != nil {
		t.Fatalf("create stale local setting: %v", err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/provider-settings/usable" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("organization_id") != "org_1" {
			t.Errorf("unexpected organization_id %q", r.URL.Query().Get("organization_id"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"provider_settings": []OrgProviderSetting{
				{ID: "prov_org_zai", OrganizationID: "org_1", Provider: "z-ai", DefaultModel: "glm-4.5"},
			},
		})
	}))
	defer srv.Close()

	local := backendsettings.NewLocalProvider(store, nil, nil)
	provider := NewProvider(srv.URL, local, nil)

	list, err := provider.List(ctx, principalWithOrg("org_1"))
	if err != nil {
		t.Fatalf("list providers: %v", err)
	}
	if len(list) != 1 || list[0].ID != "org:z-ai" {
		t.Fatalf("expected only the usable org provider, got %+v", list)
	}
}

func TestListLetsScopedLocalProviderOverrideOrgDuplicate(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "settings.db")))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	store, err := db.NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("new provider setting store: %v", err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/provider-settings/usable":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"provider_settings": []OrgProviderSetting{
					{ID: "prov_org_mistral", OrganizationID: "org_1", Provider: "mistral", DefaultModel: "mistral-large-latest"},
					{ID: "prov_org_openrouter", OrganizationID: "org_1", Provider: "openrouter", DefaultModel: "anthropic/claude-3.5-sonnet"},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	local := backendsettings.NewLocalProvider(store, nil, nil)
	provider := NewProvider(srv.URL, local, nil)
	principal := principalWithOrg("org_1")
	localMistral, err := provider.Create(ctx, principal, backendsettings.CreateSettingParams{
		Provider: "mistral", Name: "My Mistral", AuthKind: backendsettings.AuthKindNone,
	})
	if err != nil {
		t.Fatalf("create scoped local provider: %v", err)
	}

	list, err := provider.List(ctx, principal)
	if err != nil {
		t.Fatalf("list providers: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected local mistral plus org openrouter, got %+v", list)
	}
	if list[0].ID != localMistral.ID || list[0].Provider != "mistral" {
		t.Fatalf("expected scoped local mistral first, got %+v", list[0])
	}
	if list[1].ID != "org:openrouter" || list[1].Provider != "openrouter" {
		t.Fatalf("expected org openrouter second, got %+v", list[1])
	}
}
