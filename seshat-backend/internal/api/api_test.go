package api

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	backendknowledge "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	backendplans "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/plans"
	backendquery "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/query"
	bksettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
	backendskills "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/skills"
	backendwebsearch "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/websearch"
	"github.com/KPO-Tech/seshat/pkg/monitoring"
	"github.com/KPO-Tech/seshat/pkg/providers"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/runtimepath"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	publicskills "github.com/KPO-Tech/seshat/pkg/skills"
	skillsloader "github.com/KPO-Tech/seshat/pkg/skills"
	"github.com/KPO-Tech/seshat/pkg/storage"
	"github.com/KPO-Tech/seshat/pkg/types"
	"github.com/KPO-Tech/seshat/pkg/vector"
	webcore "github.com/KPO-Tech/seshat/pkg/web"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func newAuditTestApp(t *testing.T) (*App, *db.IdentityStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "audit-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	auditLogStore, err := db.NewAuditLogStore(database)
	if err != nil {
		t.Fatalf("NewAuditLogStore: %v", err)
	}

	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@audit.test",
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
			Identity:          identity,
			AuditLogStore:     auditLogStore,
		}),
		db: database,
	}
	return app, identity
}

func TestAuditLogsEndpointScoped(t *testing.T) {
	app, identity := newAuditTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	adminToken := loginAs(t, router, "admin@audit.test", "adminpass")

	// Seed some audit entries directly via the store
	ctx := context.Background()
	auditStore, err := db.NewAuditLogStore(app.db)
	if err != nil {
		t.Fatalf("NewAuditLogStore: %v", err)
	}

	// Get admin user ID
	principal, err := app.backend.Auth.ResolvePrincipal(ctx, adminToken)
	if err != nil {
		t.Fatalf("ResolvePrincipal: %v", err)
	}
	adminID := principal.User.ID

	// Create a second user
	bobHash, err := db.HashPassword("bobpass")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	bob, err := identity.CreateUser(ctx, db.CreateUserParams{
		Email:        "bob@audit.test",
		PasswordHash: bobHash,
		DisplayName:  "Bob",
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	bobToken := loginAs(t, router, "bob@audit.test", "bobpass")
	_ = bobToken

	// Create audit entries for admin
	_, err = auditStore.Create(ctx, db.CreateAuditLogParams{
		ActorUserID: adminID,
		Action:      "auth.login",
		Status:      "success",
	})
	if err != nil {
		t.Fatalf("Create admin audit log: %v", err)
	}

	// Create audit entries for bob
	_, err = auditStore.Create(ctx, db.CreateAuditLogParams{
		ActorUserID: bob.ID,
		Action:      "file.upload",
		Status:      "success",
	})
	if err != nil {
		t.Fatalf("Create bob audit log: %v", err)
	}

	// Admin sees all entries
	req := httptest.NewRequest(http.MethodGet, "/api/v1/audit/logs", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin get audit logs: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var adminResp map[string]any
	json.NewDecoder(rec.Body).Decode(&adminResp)
	adminCount := int(adminResp["count"].(float64))
	if adminCount < 2 {
		t.Fatalf("expected admin to see at least 2 logs, got %d", adminCount)
	}

	// Bob only sees his own entries (at least the manually seeded one + his login events)
	req = httptest.NewRequest(http.MethodGet, "/api/v1/audit/logs", nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("bob get audit logs: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var bobResp map[string]any
	json.NewDecoder(rec.Body).Decode(&bobResp)
	bobCount := int(bobResp["count"].(float64))
	if bobCount < 1 {
		t.Fatalf("expected bob to see at least 1 log, got %d", bobCount)
	}
	logs := bobResp["logs"].([]any)
	for _, l := range logs {
		entry := l.(map[string]any)
		if entry["actor_user_id"] != bob.ID {
			t.Fatalf("expected only bob's logs, got actor_user_id=%v", entry["actor_user_id"])
		}
	}
}

func TestHealthEndpointEnriched(t *testing.T) {
	app, _ := newAuditTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("health: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["status"] != "ok" {
		t.Fatalf("expected status=ok, got %v", resp["status"])
	}
	if resp["components"] == nil {
		t.Fatal("expected components field in health response")
	}
	components := resp["components"].(map[string]any)
	if components["database"] != "ok" {
		t.Fatalf("expected database=ok, got %v", components["database"])
	}
}

func TestSystemStatusIncludesHostCapabilities(t *testing.T) {
	app, _ := newAuditTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/system/status", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("system status: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["mode"] != "standalone" {
		t.Fatalf("expected standalone mode, got %v", resp["mode"])
	}
	if _, ok := resp["sandbox_confined"].(bool); !ok {
		t.Fatalf("expected sandbox_confined bool, got %T", resp["sandbox_confined"])
	}
}

func TestRateLimiter(t *testing.T) {
	limiter := NewRateLimiter(3, time.Hour) // long window so it doesn't expire during the test
	// Allow 3 requests
	if !limiter.Allow("user-1") {
		t.Fatal("expected Allow=true for request 1")
	}
	if !limiter.Allow("user-1") {
		t.Fatal("expected Allow=true for request 2")
	}
	if !limiter.Allow("user-1") {
		t.Fatal("expected Allow=true for request 3")
	}
	// 4th request exceeds limit
	if limiter.Allow("user-1") {
		t.Fatal("expected Allow=false for request 4 (limit exceeded)")
	}
	// Different user is unaffected
	if !limiter.Allow("user-2") {
		t.Fatal("expected Allow=true for user-2 (independent window)")
	}
}

func TestNilRateLimiterAllowsAll(t *testing.T) {
	var limiter *RateLimiter
	for i := 0; i < 100; i++ {
		if !limiter.Allow("user-1") {
			t.Fatal("nil limiter should always allow")
		}
	}
}

func newTestMonitoring(t *testing.T) *monitoring.System {
	t.Helper()
	return monitoring.NewSystem(nil)
}

type stubQueryRunner struct{}

func (stubQueryRunner) RunPrompt(ctx context.Context, input backendquery.QueryInput) (*queryExecutionResult, error) {
	return &queryExecutionResult{
		SessionID:   "sess_test",
		Content:     "stubbed:" + input.Prompt,
		StopReason:  types.StopReasonEndTurn,
		TurnNumber:  1,
		IsComplete:  true,
		ToolUses:    nil,
		ToolResults: nil,
	}, nil
}

func newTestAPIApp(identity *db.IdentityStore, runner queryRunner) *App {
	return &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity:     identity,
			QueryRuntime: runner,
			Monitoring:   monitoring.NewSystem(nil),
		}),
	}
}

func newMetricsTestAPIApp(mon *monitoring.System) *App {
	return &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Monitoring: mon,
		}),
	}
}

func TestAuthLoginMeLogoutFlow(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "api-auth.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()

	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}

	if _, err := store.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "secret-password",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	}); err != nil {
		t.Fatalf("EnsureBootstrap failed: %v", err)
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))

	loginBody, _ := json.Marshal(map[string]any{
		"email":    "admin@example.com",
		"password": "secret-password",
	})
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp := httptest.NewRecorder()
	router.ServeHTTP(loginResp, loginReq)
	if loginResp.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d: %s", loginResp.Code, loginResp.Body.String())
	}

	var loginPayload loginResponse
	if err := json.Unmarshal(loginResp.Body.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loginPayload.Token == "" {
		t.Fatal("expected login token")
	}

	meReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+loginPayload.Token)
	meResp := httptest.NewRecorder()
	router.ServeHTTP(meResp, meReq)
	if meResp.Code != http.StatusOK {
		t.Fatalf("expected me 200, got %d: %s", meResp.Code, meResp.Body.String())
	}

	adminReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/admin/ping", nil)
	adminReq.Header.Set("Authorization", "Bearer "+loginPayload.Token)
	adminResp := httptest.NewRecorder()
	router.ServeHTTP(adminResp, adminReq)
	if adminResp.Code != http.StatusOK {
		t.Fatalf("expected admin ping 200, got %d: %s", adminResp.Code, adminResp.Body.String())
	}

	logoutReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	logoutReq.Header.Set("Authorization", "Bearer "+loginPayload.Token)
	logoutResp := httptest.NewRecorder()
	router.ServeHTTP(logoutResp, logoutReq)
	if logoutResp.Code != http.StatusOK {
		t.Fatalf("expected logout 200, got %d: %s", logoutResp.Code, logoutResp.Body.String())
	}

	meAfterLogoutReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	meAfterLogoutReq.Header.Set("Authorization", "Bearer "+loginPayload.Token)
	meAfterLogoutResp := httptest.NewRecorder()
	router.ServeHTTP(meAfterLogoutResp, meAfterLogoutReq)
	if meAfterLogoutResp.Code != http.StatusUnauthorized {
		t.Fatalf("expected me after logout 401, got %d: %s", meAfterLogoutResp.Code, meAfterLogoutResp.Body.String())
	}
}

// TestAuthMeIncludesOrganizationID is a regression test for a bug found
// live: seshat-ui's useOrganizationStore has no other way to learn "which
// organization" than GET /auth/me, but this endpoint used to omit
// organization info entirely (its DTO only carried workspace_memberships'
// slugs, never an id) - every org-scoped feature in the desktop app
// (Variables, Automation's Overview/Projects) was permanently stuck with no
// organization at all, regardless of network conditions, on every account.
func TestAuthMeIncludesOrganizationID(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "api-auth-me-org.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()

	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}
	bootstrap, err := store.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "secret-password",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	})
	if err != nil {
		t.Fatalf("EnsureBootstrap failed: %v", err)
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))
	token := loginForToken(t, router, "admin@example.com", "secret-password")

	meReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+token)
	meResp := httptest.NewRecorder()
	router.ServeHTTP(meResp, meReq)
	if meResp.Code != http.StatusOK {
		t.Fatalf("expected me 200, got %d: %s", meResp.Code, meResp.Body.String())
	}

	var payload authPrincipalResponse
	if err := json.Unmarshal(meResp.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode /auth/me response: %v", err)
	}
	if payload.OrganizationID != bootstrap.Organization.ID {
		t.Fatalf("expected organization_id %q, got %q (full body: %s)", bootstrap.Organization.ID, payload.OrganizationID, meResp.Body.String())
	}
}

func TestAdminEndpointRejectsNonAdminUser(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "api-member.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()

	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}

	passwordHash, err := db.HashPassword("member-password")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	user, err := store.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "member@example.com",
		DisplayName:  "Member",
		PasswordHash: passwordHash,
	})
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	if err := store.AssignRoleToUser(context.Background(), user.ID, "member"); err != nil {
		t.Fatalf("AssignRoleToUser failed: %v", err)
	}
	session, token, err := store.CreateLoginSession(context.Background(), user.ID, 24*time.Hour, nil)
	if err != nil {
		t.Fatalf("CreateLoginSession failed: %v", err)
	}
	if session == nil || token == "" {
		t.Fatal("expected created member auth session")
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/admin/ping", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected admin ping 403 for member user, got %d: %s", resp.Code, resp.Body.String())
	}
}

// TestAdminUpdateUser guards against a regression where PUT /api/v1/users/{id}
// always failed with 400: the handler decoded the request body into
// adminUpdateUserRequest, then delegated to a legacy handler that tried to
// decode the same (already-consumed) r.Body again. It also verifies the Role
// field — previously accepted by the request struct but never actually
// wired to anything — now really changes the target user's role.
func TestAdminUpdateUser(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "api-admin-update-user.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()

	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}
	if _, err := store.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@update-user.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Main",
		DefaultWorkspaceSlug: "main",
	}); err != nil {
		t.Fatalf("EnsureBootstrap failed: %v", err)
	}
	memberHash, err := db.HashPassword("memberpass")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	member, err := store.CreateUser(context.Background(), db.CreateUserParams{
		Email: "member@update-user.test", DisplayName: "Member", PasswordHash: memberHash,
	})
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	if err := store.AssignRoleToUser(context.Background(), member.ID, "member"); err != nil {
		t.Fatalf("AssignRoleToUser failed: %v", err)
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))
	adminToken := loginForToken(t, router, "admin@update-user.test", "adminpass")

	// A plain field update, with no role change, must succeed — this alone
	// was broken before the fix (any non-empty PUT body 400'd).
	body, _ := json.Marshal(map[string]any{"display_name": "Member Renamed"})
	renameResp := doRequest(t, router, http.MethodPut, "/api/v1/users/"+member.ID, body, adminToken)
	if renameResp.Code != http.StatusOK {
		t.Fatalf("rename: expected 200, got %d: %s", renameResp.Code, renameResp.Body.String())
	}
	var renamed map[string]any
	json.Unmarshal(renameResp.Body.Bytes(), &renamed)
	if renamed["display_name"] != "Member Renamed" {
		t.Fatalf("expected display_name updated, got: %s", renameResp.Body.String())
	}

	// Promoting to admin must actually take effect.
	roleBody, _ := json.Marshal(map[string]any{"role": "admin"})
	promoteResp := doRequest(t, router, http.MethodPut, "/api/v1/users/"+member.ID, roleBody, adminToken)
	if promoteResp.Code != http.StatusOK {
		t.Fatalf("promote: expected 200, got %d: %s", promoteResp.Code, promoteResp.Body.String())
	}
	var promoted map[string]any
	json.Unmarshal(promoteResp.Body.Bytes(), &promoted)
	roles, _ := promoted["roles"].([]any)
	if len(roles) != 1 || roles[0] != "admin" {
		t.Fatalf("expected roles [admin] after promotion, got: %s", promoteResp.Body.String())
	}

	dbRoles, err := store.ListUserRoles(context.Background(), member.ID)
	if err != nil {
		t.Fatalf("ListUserRoles: %v", err)
	}
	if len(dbRoles) != 1 || dbRoles[0].Name != "admin" {
		t.Fatalf("expected member's stored roles to be exactly [admin], got: %+v", dbRoles)
	}
}

// TestDeleteOwnAccountAsNonAdminMember guards against a regression where
// self-service account deletion was routed through the admin-only
// Provider.UpdateUser path and became unusable for any non-admin user.
func TestDeleteOwnAccountAsNonAdminMember(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "api-delete-own-account.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()

	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}

	passwordHash, err := db.HashPassword("member-password")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	user, err := store.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "member-self-delete@example.com",
		DisplayName:  "Member",
		PasswordHash: passwordHash,
	})
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	if err := store.AssignRoleToUser(context.Background(), user.ID, "member"); err != nil {
		t.Fatalf("AssignRoleToUser failed: %v", err)
	}
	_, token, err := store.CreateLoginSession(context.Background(), user.ID, 24*time.Hour, nil)
	if err != nil {
		t.Fatalf("CreateLoginSession failed: %v", err)
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))

	body, _ := json.Marshal(map[string]any{"confirm_email": "member-self-delete@example.com"})
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/users/me", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusNoContent && resp.Code != http.StatusOK {
		t.Fatalf("expected self-delete to succeed for a non-admin member, got %d: %s", resp.Code, resp.Body.String())
	}

	meReq := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+token)
	meResp := httptest.NewRecorder()
	router.ServeHTTP(meResp, meReq)
	if meResp.Code != http.StatusUnauthorized {
		t.Fatalf("expected disabled account's session to be rejected, got %d: %s", meResp.Code, meResp.Body.String())
	}
}

func TestQueryRequiresAuthentication(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "api-query.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()

	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}
	if _, err := store.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "secret-password",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	}); err != nil {
		t.Fatalf("EnsureBootstrap failed: %v", err)
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))

	noAuthReq := httptest.NewRequest(http.MethodPost, "/api/v1/query", nil)
	noAuthResp := httptest.NewRecorder()
	router.ServeHTTP(noAuthResp, noAuthReq)
	if noAuthResp.Code != http.StatusUnauthorized {
		t.Fatalf("expected query without auth 401, got %d: %s", noAuthResp.Code, noAuthResp.Body.String())
	}

	loginBody, _ := json.Marshal(map[string]any{
		"email":    "admin@example.com",
		"password": "secret-password",
	})
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp := httptest.NewRecorder()
	router.ServeHTTP(loginResp, loginReq)
	if loginResp.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d: %s", loginResp.Code, loginResp.Body.String())
	}

	var loginPayload loginResponse
	if err := json.Unmarshal(loginResp.Body.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}

	authReq := httptest.NewRequest(http.MethodPost, "/api/v1/query", bytes.NewReader([]byte(`{"prompt":"hello"}`)))
	authReq.Header.Set("Authorization", "Bearer "+loginPayload.Token)
	authReq.Header.Set("Content-Type", "application/json")
	authResp := httptest.NewRecorder()
	router.ServeHTTP(authResp, authReq)
	if authResp.Code != http.StatusOK {
		t.Fatalf("expected query with auth 200, got %d: %s", authResp.Code, authResp.Body.String())
	}
}

func TestProtectedResourceCrudScope(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "api-resources.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()

	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}
	bootstrap, err := store.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "secret-password",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	})
	if err != nil {
		t.Fatalf("EnsureBootstrap failed: %v", err)
	}

	memberHash, err := db.HashPassword("member-password")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	member, err := store.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "member@example.com",
		DisplayName:  "Member",
		PasswordHash: memberHash,
	})
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	if err := store.AssignRoleToUser(context.Background(), member.ID, "member"); err != nil {
		t.Fatalf("AssignRoleToUser failed: %v", err)
	}
	if err := store.AddWorkspaceMember(context.Background(), bootstrap.Workspace.ID, member.ID, "member"); err != nil {
		t.Fatalf("AddWorkspaceMember failed: %v", err)
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))

	adminToken := loginForToken(t, router, "admin@example.com", "secret-password")
	memberToken := loginForToken(t, router, "member@example.com", "member-password")

	memberUsersReq := httptest.NewRequest(http.MethodGet, "/api/v1/users", nil)
	memberUsersReq.Header.Set("Authorization", "Bearer "+memberToken)
	memberUsersResp := httptest.NewRecorder()
	router.ServeHTTP(memberUsersResp, memberUsersReq)
	if memberUsersResp.Code != http.StatusForbidden {
		t.Fatalf("expected member users list 403, got %d: %s", memberUsersResp.Code, memberUsersResp.Body.String())
	}

	adminUsersReq := httptest.NewRequest(http.MethodGet, "/api/v1/users", nil)
	adminUsersReq.Header.Set("Authorization", "Bearer "+adminToken)
	adminUsersResp := httptest.NewRecorder()
	router.ServeHTTP(adminUsersResp, adminUsersReq)
	if adminUsersResp.Code != http.StatusOK {
		t.Fatalf("expected admin users list 200, got %d: %s", adminUsersResp.Code, adminUsersResp.Body.String())
	}

	memberOrgsReq := httptest.NewRequest(http.MethodGet, "/api/v1/organizations", nil)
	memberOrgsReq.Header.Set("Authorization", "Bearer "+memberToken)
	memberOrgsResp := httptest.NewRecorder()
	router.ServeHTTP(memberOrgsResp, memberOrgsReq)
	if memberOrgsResp.Code != http.StatusOK {
		t.Fatalf("expected member organizations list 200, got %d: %s", memberOrgsResp.Code, memberOrgsResp.Body.String())
	}
	if !bytes.Contains(memberOrgsResp.Body.Bytes(), []byte(`"slug":"acme"`)) {
		t.Fatalf("expected member organizations list to include acme, got %s", memberOrgsResp.Body.String())
	}

	createWorkspaceBody, _ := json.Marshal(map[string]any{
		"organization_id": bootstrap.Organization.ID,
		"name":            "Sandbox",
		"slug":            "sandbox",
	})
	memberCreateWorkspaceReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces", bytes.NewReader(createWorkspaceBody))
	memberCreateWorkspaceReq.Header.Set("Authorization", "Bearer "+memberToken)
	memberCreateWorkspaceReq.Header.Set("Content-Type", "application/json")
	memberCreateWorkspaceResp := httptest.NewRecorder()
	router.ServeHTTP(memberCreateWorkspaceResp, memberCreateWorkspaceReq)
	if memberCreateWorkspaceResp.Code != http.StatusForbidden {
		t.Fatalf("expected member workspace creation 403, got %d: %s", memberCreateWorkspaceResp.Code, memberCreateWorkspaceResp.Body.String())
	}

	adminCreateWorkspaceReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces", bytes.NewReader(createWorkspaceBody))
	adminCreateWorkspaceReq.Header.Set("Authorization", "Bearer "+adminToken)
	adminCreateWorkspaceReq.Header.Set("Content-Type", "application/json")
	adminCreateWorkspaceResp := httptest.NewRecorder()
	router.ServeHTTP(adminCreateWorkspaceResp, adminCreateWorkspaceReq)
	if adminCreateWorkspaceResp.Code != http.StatusCreated {
		t.Fatalf("expected admin workspace creation 201, got %d: %s", adminCreateWorkspaceResp.Code, adminCreateWorkspaceResp.Body.String())
	}

	var createdWorkspace map[string]any
	if err := json.Unmarshal(adminCreateWorkspaceResp.Body.Bytes(), &createdWorkspace); err != nil {
		t.Fatalf("decode created workspace: %v", err)
	}
	workspaceID, _ := createdWorkspace["id"].(string)
	if workspaceID == "" {
		t.Fatalf("expected created workspace id, got %#v", createdWorkspace)
	}

	updateWorkspaceBody, _ := json.Marshal(map[string]any{"name": "Sandbox Updated"})
	updateWorkspaceReq := httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/"+workspaceID, bytes.NewReader(updateWorkspaceBody))
	updateWorkspaceReq.Header.Set("Authorization", "Bearer "+adminToken)
	updateWorkspaceReq.Header.Set("Content-Type", "application/json")
	updateWorkspaceResp := httptest.NewRecorder()
	router.ServeHTTP(updateWorkspaceResp, updateWorkspaceReq)
	if updateWorkspaceResp.Code != http.StatusOK {
		t.Fatalf("expected admin workspace update 200, got %d: %s", updateWorkspaceResp.Code, updateWorkspaceResp.Body.String())
	}

	getWorkspaceReq := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/"+workspaceID, nil)
	getWorkspaceReq.Header.Set("Authorization", "Bearer "+adminToken)
	getWorkspaceResp := httptest.NewRecorder()
	router.ServeHTTP(getWorkspaceResp, getWorkspaceReq)
	if getWorkspaceResp.Code != http.StatusOK {
		t.Fatalf("expected workspace get 200, got %d: %s", getWorkspaceResp.Code, getWorkspaceResp.Body.String())
	}

	deleteWorkspaceReq := httptest.NewRequest(http.MethodDelete, "/api/v1/workspaces/"+workspaceID, nil)
	deleteWorkspaceReq.Header.Set("Authorization", "Bearer "+adminToken)
	deleteWorkspaceResp := httptest.NewRecorder()
	router.ServeHTTP(deleteWorkspaceResp, deleteWorkspaceReq)
	if deleteWorkspaceResp.Code != http.StatusOK {
		t.Fatalf("expected workspace delete 200, got %d: %s", deleteWorkspaceResp.Code, deleteWorkspaceResp.Body.String())
	}
}

func loginForToken(t *testing.T, router http.Handler, email, password string) string {
	t.Helper()

	loginBody, _ := json.Marshal(map[string]any{
		"email":    email,
		"password": password,
	})
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp := httptest.NewRecorder()
	router.ServeHTTP(loginResp, loginReq)
	if loginResp.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d: %s", loginResp.Code, loginResp.Body.String())
	}

	var payload loginResponse
	if err := json.Unmarshal(loginResp.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	return payload.Token
}

// ─── Metrics endpoint ─────────────────────────────────────────────────────────

func TestMetricsEndpointPrometheus(t *testing.T) {
	mon := newTestMonitoring(t)
	mon.RecordAPIRequest()
	mon.RecordToolCall("bash")

	router := CreateRouter(APIConfig{}, newMetricsTestAPIApp(mon))

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	ct := rr.Header().Get("Content-Type")
	if ct == "" {
		t.Fatal("expected Content-Type header")
	}
}

func TestMetricsEndpointJSONViaAPI(t *testing.T) {
	mon := newTestMonitoring(t)
	mon.RecordAPISuccess(time.Millisecond * 50)

	router := CreateRouter(APIConfig{}, newMetricsTestAPIApp(mon))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	ct := rr.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Fatalf("expected application/json, got %q", ct)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not valid JSON: %v\nbody: %s", err, rr.Body.String())
	}
}

func TestMetricsEndpointFormatOverride(t *testing.T) {
	mon := newTestMonitoring(t)
	router := CreateRouter(APIConfig{}, newMetricsTestAPIApp(mon))

	req := httptest.NewRequest(http.MethodGet, "/metrics?format=json", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if rr.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("expected application/json, got %q", rr.Header().Get("Content-Type"))
	}
}

func TestMetricsEndpointNotAvailableWithoutMonitoring(t *testing.T) {
	router := CreateRouter(APIConfig{}, newMetricsTestAPIApp(nil))

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rr.Code)
	}
}

func TestMetricsEndpointMethodNotAllowed(t *testing.T) {
	mon := newTestMonitoring(t)
	router := CreateRouter(APIConfig{}, newMetricsTestAPIApp(mon))

	req := httptest.NewRequest(http.MethodPost, "/metrics", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rr.Code)
	}
}

func mustParseCIDR(t *testing.T, s string) *net.IPNet {
	t.Helper()
	_, cidr, err := net.ParseCIDR(s)
	if err != nil {
		t.Fatalf("parseCIDR(%q): %v", s, err)
	}
	return cidr
}

// TestResolveClientIP_NoTrustedProxy: sans proxy configuré, RemoteAddr est toujours utilisé
// même si X-Forwarded-For est présent — évite le spoofing.
func TestResolveClientIP_NoTrustedProxy(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "1.2.3.4:5678"
	r.Header.Set("X-Forwarded-For", "10.0.0.1")
	r.Header.Set("X-Real-Ip", "10.0.0.2")

	got := resolveClientIP(r, nil)
	if got != "1.2.3.4" {
		t.Errorf("expected RemoteAddr IP 1.2.3.4, got %q", got)
	}
}

// TestResolveClientIP_TrustedProxy_UsesXFFLeftmost: le proxy de confiance permet d'honorer
// X-Forwarded-For; on prend la première valeur (IP réelle du client).
func TestResolveClientIP_TrustedProxy_UsesXFFLeftmost(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "10.0.0.1:9999"
	r.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.2")

	got := resolveClientIP(r, []*net.IPNet{mustParseCIDR(t, "10.0.0.0/8")})
	if got != "203.0.113.5" {
		t.Errorf("expected XFF leftmost 203.0.113.5, got %q", got)
	}
}

// TestResolveClientIP_TrustedProxy_FallsBackToXRealIP: si X-Forwarded-For absent, utilise X-Real-Ip.
func TestResolveClientIP_TrustedProxy_FallsBackToXRealIP(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "10.0.0.1:9999"
	r.Header.Set("X-Real-Ip", "203.0.113.42")

	got := resolveClientIP(r, []*net.IPNet{mustParseCIDR(t, "10.0.0.0/8")})
	if got != "203.0.113.42" {
		t.Errorf("expected X-Real-Ip 203.0.113.42, got %q", got)
	}
}

// TestResolveClientIP_UntrustedProxy_IgnoresForwardingHeaders: un client direct qui envoie
// X-Forwarded-For ne peut pas spoofer son IP.
func TestResolveClientIP_UntrustedProxy_IgnoresForwardingHeaders(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "5.5.5.5:1234" // pas dans 10.0.0.0/8
	r.Header.Set("X-Forwarded-For", "192.168.1.1")

	got := resolveClientIP(r, []*net.IPNet{mustParseCIDR(t, "10.0.0.0/8")})
	if got != "5.5.5.5" {
		t.Errorf("expected RemoteAddr 5.5.5.5, got %q", got)
	}
}

// TestResolveClientIP_IPv6: adresses IPv6 correctement parsées depuis RemoteAddr.
func TestResolveClientIP_IPv6(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "[::1]:12345"
	r.Header.Set("X-Forwarded-For", "203.0.113.7")

	got := resolveClientIP(r, nil)
	if got != "::1" {
		t.Errorf("expected IPv6 loopback ::1, got %q", got)
	}
}

// TestResolveClientIP_TrustedProxyWithNoHeaders: proxy de confiance mais sans forwarding headers
// → retombe sur RemoteAddr.
func TestResolveClientIP_TrustedProxyWithNoHeaders(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "10.0.0.1:8080"

	got := resolveClientIP(r, []*net.IPNet{mustParseCIDR(t, "10.0.0.0/8")})
	if got != "10.0.0.1" {
		t.Errorf("expected RemoteAddr fallback 10.0.0.1, got %q", got)
	}
}

// TestParseTrustedProxies: les CIDRs, les IPs nues et les entrées invalides sont gérées.
func TestParseTrustedProxies(t *testing.T) {
	cidrs := ParseTrustedProxies("10.0.0.0/8, 192.168.1.1, ::1, , bad!")
	if len(cidrs) != 3 {
		t.Fatalf("expected 3 valid CIDRs, got %d", len(cidrs))
	}
}

// TestParseTrustedProxies_Empty: une chaîne vide ne produit aucune entrée.
func TestParseTrustedProxies_Empty(t *testing.T) {
	if got := ParseTrustedProxies(""); len(got) != 0 {
		t.Errorf("expected 0 CIDRs for empty input, got %d", len(got))
	}
}

func TestDesktopHandshakeReturnsVerifiableProof(t *testing.T) {
	t.Setenv(runtimepath.EnvRuntimeRoot, t.TempDir())

	router := CreateRouter(APIConfig{}, &App{})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/desktop/handshake?nonce=test-nonce", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	var payload struct {
		Algorithm string `json:"algorithm"`
		Proof     string `json:"proof"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Algorithm != "hmac-sha256" {
		t.Fatalf("unexpected algorithm %q", payload.Algorithm)
	}

	encodedSecret, err := os.ReadFile(desktopBridgeSecretPath())
	if err != nil {
		t.Fatalf("read secret: %v", err)
	}
	secret, err := hex.DecodeString(strings.TrimSpace(string(encodedSecret)))
	if err != nil {
		t.Fatalf("decode secret: %v", err)
	}

	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte("test-nonce"))
	expected := hex.EncodeToString(mac.Sum(nil))
	if payload.Proof != expected {
		t.Fatalf("unexpected proof: want %q, got %q", expected, payload.Proof)
	}
}

// --- stub ArtifactStore (in-memory) ---

type stubArtifactStore struct {
	blobs map[string][]byte
}

func newStubArtifactStore() *stubArtifactStore {
	return &stubArtifactStore{blobs: make(map[string][]byte)}
}

func (s *stubArtifactStore) Put(_ context.Context, key string, body []byte, _ string) (storage.ArtifactRef, error) {
	cp := make([]byte, len(body))
	copy(cp, body)
	s.blobs[key] = cp
	return storage.ArtifactRef{Key: key, Size: int64(len(body))}, nil
}

func (s *stubArtifactStore) PutArtifact(_ context.Context, req storage.ArtifactPutRequest, body []byte) (storage.ArtifactRef, error) {
	key := string(req.Namespace) + "/" + req.Filename
	return s.Put(context.Background(), key, body, req.ContentType)
}

func (s *stubArtifactStore) Get(_ context.Context, key string) ([]byte, error) {
	b, ok := s.blobs[key]
	if !ok {
		return nil, fmt.Errorf("key not found: %s", key)
	}
	return b, nil
}

func (s *stubArtifactStore) OpenReader(_ context.Context, key string) (io.ReadCloser, storage.ArtifactRef, error) {
	b, ok := s.blobs[key]
	if !ok {
		return nil, storage.ArtifactRef{}, fmt.Errorf("key not found: %s", key)
	}
	return io.NopCloser(bytes.NewReader(b)), storage.ArtifactRef{Key: key, Size: int64(len(b))}, nil
}

func (s *stubArtifactStore) Delete(_ context.Context, key string) error {
	delete(s.blobs, key)
	return nil
}

func (s *stubArtifactStore) Stat(_ context.Context, key string) (storage.ArtifactRef, error) {
	b, ok := s.blobs[key]
	if !ok {
		return storage.ArtifactRef{}, fmt.Errorf("key not found: %s", key)
	}
	return storage.ArtifactRef{Key: key, Size: int64(len(b))}, nil
}

func (s *stubArtifactStore) Exists(_ context.Context, key string) (bool, error) {
	_, ok := s.blobs[key]
	return ok, nil
}

func (s *stubArtifactStore) List(_ context.Context, _ storage.ListOptions) ([]storage.ArtifactRef, error) {
	return nil, nil
}

func (s *stubArtifactStore) Metadata(_ context.Context, _ string) (storage.ArtifactMetadata, error) {
	return storage.ArtifactMetadata{}, nil
}

func (s *stubArtifactStore) ListMetadata(_ context.Context, _ storage.ListOptions) ([]storage.ArtifactMetadata, error) {
	return nil, nil
}

func (s *stubArtifactStore) GarbageCollect(_ context.Context, _ storage.GCOptions) (storage.GCReport, error) {
	return storage.GCReport{}, nil
}

func (s *stubArtifactStore) URL(_ context.Context, key string) (string, error) {
	return "stub://" + key, nil
}

// --- helpers ---

func newFileTestApp(t *testing.T) (*App, *db.IdentityStore, *db.FileStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "file-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	fileStore, err := db.NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@files.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	}); err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	blobStore := newStubArtifactStore()
	app := &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity:      identity,
			FileStore:     fileStore,
			ArtifactStore: blobStore,
		}),
	}
	return app, identity, fileStore
}

func loginAs(t *testing.T, router http.Handler, email, password string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login failed: %d %s", rec.Code, rec.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(rec.Body).Decode(&resp)
	return resp["token"]
}

func multipartUpload(t *testing.T, router http.Handler, token, filename, contentType string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	fw.Write(content)
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

// --- tests ---

func TestFileUploadAndListScoped(t *testing.T) {
	app, identity, _ := newFileTestApp(t)
	router := CreateRouter(APIConfig{}, app)

	// Create a second member user
	adminToken := loginAs(t, router, "admin@files.test", "adminpass")

	// Create member user via admin
	body, _ := json.Marshal(map[string]any{
		"email":    "member@files.test",
		"password": "memberpass",
		"roles":    []string{"member"},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create member: %d %s", rec.Code, rec.Body.String())
	}
	_ = identity // used implicitly via app

	memberToken := loginAs(t, router, "member@files.test", "memberpass")

	// Member uploads a file
	uploadRec := multipartUpload(t, router, memberToken, "hello.txt", "text/plain", []byte("hello world"))
	if uploadRec.Code != http.StatusCreated {
		t.Fatalf("upload failed: %d %s", uploadRec.Code, uploadRec.Body.String())
	}

	// Member lists files — should see 1
	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/files", nil)
	req2.Header.Set("Authorization", "Bearer "+memberToken)
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("list files (member): %d %s", rec2.Code, rec2.Body.String())
	}
	var listResp map[string]any
	json.NewDecoder(rec2.Body).Decode(&listResp)
	count := int(listResp["count"].(float64))
	if count != 1 {
		t.Errorf("expected member to see 1 file, got %d", count)
	}

	// Admin lists files — should see 1 (admin sees all)
	req3 := httptest.NewRequest(http.MethodGet, "/api/v1/files", nil)
	req3.Header.Set("Authorization", "Bearer "+adminToken)
	rec3 := httptest.NewRecorder()
	router.ServeHTTP(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Fatalf("list files (admin): %d %s", rec3.Code, rec3.Body.String())
	}
	var adminListResp map[string]any
	json.NewDecoder(rec3.Body).Decode(&adminListResp)
	adminCount := int(adminListResp["count"].(float64))
	if adminCount < 1 {
		t.Errorf("expected admin to see >=1 file, got %d", adminCount)
	}
}

func TestFileMetadataAndCrossUserAccess(t *testing.T) {
	app, _, _ := newFileTestApp(t)
	router := CreateRouter(APIConfig{}, app)

	adminToken := loginAs(t, router, "admin@files.test", "adminpass")

	// Create member
	body, _ := json.Marshal(map[string]any{"email": "member2@files.test", "password": "pass2", "roles": []string{"member"}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create member: %d %s", rec.Code, rec.Body.String())
	}

	memberToken := loginAs(t, router, "member2@files.test", "pass2")

	// Member uploads
	uploadRec := multipartUpload(t, router, memberToken, "doc.md", "text/markdown", []byte("# Hello"))
	if uploadRec.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", uploadRec.Code, uploadRec.Body.String())
	}
	var uploaded fileResponse
	json.NewDecoder(uploadRec.Body).Decode(&uploaded)
	fileID := uploaded.ID

	// Member fetches own metadata — OK
	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+fileID, nil)
	req2.Header.Set("Authorization", "Bearer "+memberToken)
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Errorf("member get own file: expected 200, got %d", rec2.Code)
	}

	// Admin fetches it too — OK (admin override)
	req3 := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+fileID, nil)
	req3.Header.Set("Authorization", "Bearer "+adminToken)
	rec3 := httptest.NewRecorder()
	router.ServeHTTP(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Errorf("admin get member file: expected 200, got %d %s", rec3.Code, rec3.Body.String())
	}

	// Create another member
	body2, _ := json.Marshal(map[string]any{"email": "other@files.test", "password": "otherpass", "roles": []string{"member"}})
	reqB := httptest.NewRequest(http.MethodPost, "/api/v1/users", bytes.NewReader(body2))
	reqB.Header.Set("Content-Type", "application/json")
	reqB.Header.Set("Authorization", "Bearer "+adminToken)
	recB := httptest.NewRecorder()
	router.ServeHTTP(recB, reqB)
	if recB.Code != http.StatusCreated {
		t.Fatalf("create other: %d %s", recB.Code, recB.Body.String())
	}
	otherToken := loginAs(t, router, "other@files.test", "otherpass")

	// Other member tries to fetch — should get 403
	req4 := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+fileID, nil)
	req4.Header.Set("Authorization", "Bearer "+otherToken)
	rec4 := httptest.NewRecorder()
	router.ServeHTTP(rec4, req4)
	if rec4.Code != http.StatusForbidden {
		t.Errorf("cross-user get: expected 403, got %d", rec4.Code)
	}
}

func TestFileDownloadContent(t *testing.T) {
	app, _, _ := newFileTestApp(t)
	router := CreateRouter(APIConfig{}, app)

	adminToken := loginAs(t, router, "admin@files.test", "adminpass")

	content := []byte("the quick brown fox")
	uploadRec := multipartUpload(t, router, adminToken, "fox.txt", "text/plain", content)
	if uploadRec.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", uploadRec.Code, uploadRec.Body.String())
	}
	var uploaded fileResponse
	json.NewDecoder(uploadRec.Body).Decode(&uploaded)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+uploaded.ID+"/content", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("download: %d %s", rec.Code, rec.Body.String())
	}
	got := rec.Body.Bytes()
	if string(got) != string(content) {
		t.Errorf("downloaded content mismatch: got %q, want %q", got, content)
	}
}

func TestFileDelete(t *testing.T) {
	app, _, _ := newFileTestApp(t)
	router := CreateRouter(APIConfig{}, app)

	adminToken := loginAs(t, router, "admin@files.test", "adminpass")

	// Create member
	body, _ := json.Marshal(map[string]any{"email": "del@files.test", "password": "delpass", "roles": []string{"member"}})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create member: %d %s", rec.Code, rec.Body.String())
	}

	memberToken := loginAs(t, router, "del@files.test", "delpass")

	// Member uploads
	uploadRec := multipartUpload(t, router, memberToken, "temp.bin", "application/octet-stream", []byte("data"))
	if uploadRec.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", uploadRec.Code, uploadRec.Body.String())
	}
	var uploaded fileResponse
	json.NewDecoder(uploadRec.Body).Decode(&uploaded)
	fileID := uploaded.ID

	// Create another member — cross-user delete must fail
	body2, _ := json.Marshal(map[string]any{"email": "other2@files.test", "password": "pass2", "roles": []string{"member"}})
	reqB := httptest.NewRequest(http.MethodPost, "/api/v1/users", bytes.NewReader(body2))
	reqB.Header.Set("Content-Type", "application/json")
	reqB.Header.Set("Authorization", "Bearer "+adminToken)
	recB := httptest.NewRecorder()
	router.ServeHTTP(recB, reqB)
	if recB.Code != http.StatusCreated {
		t.Fatalf("create other2: %d %s", recB.Code, recB.Body.String())
	}
	otherToken := loginAs(t, router, "other2@files.test", "pass2")

	req3 := httptest.NewRequest(http.MethodDelete, "/api/v1/files/"+fileID, nil)
	req3.Header.Set("Authorization", "Bearer "+otherToken)
	rec3 := httptest.NewRecorder()
	router.ServeHTTP(rec3, req3)
	if rec3.Code != http.StatusForbidden {
		t.Errorf("cross-user delete: expected 403, got %d", rec3.Code)
	}

	// Member deletes own file — OK
	req4 := httptest.NewRequest(http.MethodDelete, "/api/v1/files/"+fileID, nil)
	req4.Header.Set("Authorization", "Bearer "+memberToken)
	rec4 := httptest.NewRecorder()
	router.ServeHTTP(rec4, req4)
	if rec4.Code != http.StatusNoContent {
		t.Errorf("own delete: expected 204, got %d %s", rec4.Code, rec4.Body.String())
	}

	// File is gone — next GET must 404
	req5 := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+fileID, nil)
	req5.Header.Set("Authorization", "Bearer "+memberToken)
	rec5 := httptest.NewRecorder()
	router.ServeHTTP(rec5, req5)
	if rec5.Code != http.StatusNotFound {
		t.Errorf("after delete get: expected 404, got %d", rec5.Code)
	}

	// Suppress unused import warning
	_ = strings.TrimSpace
}

// ─── Stubs ────────────────────────────────────────────────────────────────────

// stubEmbedder returns a fixed-dimension unit vector for every text.
type stubEmbedder struct {
	dim               int
	mu                sync.Mutex
	failuresRemaining int
	failureMessage    string
}

func (e *stubEmbedder) EmbedTexts(_ context.Context, texts []string) ([][]float32, error) {
	e.mu.Lock()
	if e.failuresRemaining > 0 {
		e.failuresRemaining--
		msg := e.failureMessage
		e.mu.Unlock()
		if msg == "" {
			msg = "embedder unavailable"
		}
		return nil, fmt.Errorf("%s", msg)
	}
	e.mu.Unlock()

	out := make([][]float32, len(texts))
	for i := range texts {
		v := make([]float32, e.dim)
		for j := range v {
			v[j] = 0.1 * float32(i+1)
		}
		out[i] = v
	}
	return out, nil
}

func (e *stubEmbedder) SetFailuresRemaining(n int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.failuresRemaining = n
}

// stubVectorStore is an in-memory vector.Store.
type stubVectorStore struct {
	records map[string][]vector.Record // namespace → records
}

func newStubVectorStore() *stubVectorStore {
	return &stubVectorStore{records: make(map[string][]vector.Record)}
}

func (s *stubVectorStore) Upsert(_ context.Context, recs []vector.Record) error {
	for _, r := range recs {
		existing := s.records[r.Namespace]
		found := false
		for i, e := range existing {
			if e.Key == r.Key {
				existing[i] = r
				found = true
				break
			}
		}
		if !found {
			s.records[r.Namespace] = append(existing, r)
		}
	}
	return nil
}

func (s *stubVectorStore) Search(_ context.Context, q vector.Query) ([]vector.SearchResult, error) {
	recs := s.records[q.Namespace]
	topK := q.TopK
	if topK <= 0 || topK > len(recs) {
		topK = len(recs)
	}
	results := make([]vector.SearchResult, 0, topK)
	for i := 0; i < topK; i++ {
		results = append(results, vector.SearchResult{Record: recs[i], Score: 1.0})
	}
	return results, nil
}

func (s *stubVectorStore) DeleteNamespace(_ context.Context, ns string) error {
	delete(s.records, ns)
	return nil
}

func (s *stubVectorStore) DeleteKeys(_ context.Context, ns string, keys []string) error {
	recs := s.records[ns]
	keep := recs[:0]
	keySet := make(map[string]bool, len(keys))
	for _, k := range keys {
		keySet[k] = true
	}
	for _, r := range recs {
		if !keySet[r.Key] {
			keep = append(keep, r)
		}
	}
	s.records[ns] = keep
	return nil
}

func (s *stubVectorStore) Get(_ context.Context, ns string, keys []string) ([]vector.Record, error) {
	recs := s.records[ns]
	if len(keys) == 0 {
		return recs, nil
	}
	keySet := make(map[string]bool, len(keys))
	for _, k := range keys {
		keySet[k] = true
	}
	var out []vector.Record
	for _, r := range recs {
		if keySet[r.Key] {
			out = append(out, r)
		}
	}
	return out, nil
}

func (s *stubVectorStore) HasNamespace(_ context.Context, ns string) (bool, error) {
	_, ok := s.records[ns]
	return ok, nil
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

func newKnowledgeTestApp(t *testing.T) (*App, *db.IdentityStore) {
	t.Helper()
	app, identity, _ := newKnowledgeTestAppWithEmbedderAndVector(t, &stubEmbedder{dim: 8})
	return app, identity
}

func newKnowledgeTestAppWithEmbedder(t *testing.T, embedder *stubEmbedder) (*App, *db.IdentityStore) {
	t.Helper()
	app, identity, _ := newKnowledgeTestAppWithEmbedderAndVector(t, embedder)
	return app, identity
}

func newKnowledgeTestAppWithEmbedderAndVector(t *testing.T, embedder *stubEmbedder) (*App, *db.IdentityStore, *stubVectorStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "knowledge-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	fileStore, err := db.NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	corpusStore, err := db.NewCorpusStore(database)
	if err != nil {
		t.Fatalf("NewCorpusStore: %v", err)
	}
	jobStore, err := db.NewKnowledgeIngestionJobStore(database)
	if err != nil {
		t.Fatalf("NewKnowledgeIngestionJobStore: %v", err)
	}

	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@knowledge.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	}); err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	blobStore := newStubArtifactStore()
	vectorStore := newStubVectorStore()
	ragSvc := rag.NewService(blobStore, vectorStore, embedder, nil)

	app := &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity:          identity,
			FileStore:         fileStore,
			CorpusStore:       corpusStore,
			IngestionJobStore: jobStore,
			ArtifactStore:     blobStore,
			RAGService:        ragSvc,
		}),
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	localKnowledge, ok := app.backend.Knowledge.(*backendknowledge.Service)
	if !ok {
		t.Fatalf("expected local *knowledge.Service, got %T", app.backend.Knowledge)
	}
	runner := backendknowledge.NewRunner(localKnowledge, backendknowledge.RunnerConfig{
		PollInterval: 10 * time.Millisecond,
		MaxPerTick:   4,
	})
	runner.Start(ctx)
	return app, identity, vectorStore
}

func newKnowledgeTestAppWithoutRunner(t *testing.T, embedder *stubEmbedder) (*App, *db.IdentityStore, *stubVectorStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "knowledge-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	fileStore, err := db.NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	corpusStore, err := db.NewCorpusStore(database)
	if err != nil {
		t.Fatalf("NewCorpusStore: %v", err)
	}
	jobStore, err := db.NewKnowledgeIngestionJobStore(database)
	if err != nil {
		t.Fatalf("NewKnowledgeIngestionJobStore: %v", err)
	}

	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@knowledge.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	}); err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	blobStore := newStubArtifactStore()
	vectorStore := newStubVectorStore()
	ragSvc := rag.NewService(blobStore, vectorStore, embedder, nil)

	app := &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity:          identity,
			FileStore:         fileStore,
			CorpusStore:       corpusStore,
			IngestionJobStore: jobStore,
			ArtifactStore:     blobStore,
			RAGService:        ragSvc,
		}),
	}
	return app, identity, vectorStore
}

// uploadTestFile uploads a file via multipart form and returns the file ID.
func uploadTestFile(t *testing.T, router http.Handler, token, content, filename string) string {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", filename)
	fmt.Fprint(fw, content)
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload file: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	return resp["id"].(string)
}

func waitForIngestionJobStatus(t *testing.T, router http.Handler, token, corpusID, jobID, want string) map[string]any {
	t.Helper()

	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/corpora/"+corpusID+"/ingest/jobs/"+jobID, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("get ingestion job: got %d, body=%s", rec.Code, rec.Body.String())
		}
		var job map[string]any
		if err := json.NewDecoder(rec.Body).Decode(&job); err != nil {
			t.Fatalf("decode ingestion job: %v", err)
		}
		if job["status"] == want {
			return job
		}
		time.Sleep(20 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for ingestion job %s to reach %s", jobID, want)
	return nil
}

// ─── Tests ────────────────────────────────────────────────────────────────────

func TestCorpusCreateAndList(t *testing.T) {
	app, _ := newKnowledgeTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	token := loginAs(t, router, "admin@knowledge.test", "adminpass")

	// Create corpus.
	body, _ := json.Marshal(map[string]string{"name": "Test Corpus", "description": "for tests"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create corpus: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	json.NewDecoder(rec.Body).Decode(&created)
	corpusID := created["id"].(string)
	if corpusID == "" {
		t.Fatal("expected non-empty corpus id")
	}

	// List corpora.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list corpora: got %d", rec.Code)
	}
	var list map[string]any
	json.NewDecoder(rec.Body).Decode(&list)
	if int(list["count"].(float64)) != 1 {
		t.Errorf("expected 1 corpus, got %v", list["count"])
	}
}

func TestCorpusGetAndDelete(t *testing.T) {
	app, _ := newKnowledgeTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@knowledge.test", "adminpass")

	// Create
	body, _ := json.Marshal(map[string]string{"name": "ToDelete"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var created map[string]any
	json.NewDecoder(rec.Body).Decode(&created)
	corpusID := created["id"].(string)

	// Get
	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora/"+corpusID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get corpus: got %d", rec.Code)
	}

	// Delete
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/corpora/"+corpusID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete corpus: got %d, body=%s", rec.Code, rec.Body.String())
	}

	// Get after delete should 404.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora/"+corpusID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get deleted corpus: expected 404, got %d", rec.Code)
	}
}

func TestCorpusAttachAndListFiles(t *testing.T) {
	app, _ := newKnowledgeTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@knowledge.test", "adminpass")

	// Create corpus.
	body, _ := json.Marshal(map[string]string{"name": "Docs Corpus"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var corpus map[string]any
	json.NewDecoder(rec.Body).Decode(&corpus)
	corpusID := corpus["id"].(string)

	// Upload a file.
	fileID := uploadTestFile(t, router, token, "Hello from a test document.", "hello.txt")

	// Attach file to corpus.
	attachBody, _ := json.Marshal(map[string]string{"file_id": fileID})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/files", bytes.NewReader(attachBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("attach file: got %d, body=%s", rec.Code, rec.Body.String())
	}

	// List files.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora/"+corpusID+"/files", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list corpus files: got %d", rec.Code)
	}
	var fileList map[string]any
	json.NewDecoder(rec.Body).Decode(&fileList)
	if int(fileList["count"].(float64)) != 1 {
		t.Errorf("expected 1 file, got %v", fileList["count"])
	}
}

func TestCorpusIngestAndSearch(t *testing.T) {
	app, _ := newKnowledgeTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@knowledge.test", "adminpass")

	// Create corpus.
	body, _ := json.Marshal(map[string]string{"name": "RAG Corpus"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var corpus map[string]any
	json.NewDecoder(rec.Body).Decode(&corpus)
	corpusID := corpus["id"].(string)

	// Upload a text file.
	content := "The Seshat engine is a powerful multi-agent AI framework that supports RAG retrieval.\n" +
		"It uses vector search to find relevant documents.\n"
	fileID := uploadTestFile(t, router, token, content, "seshat.txt")

	// Ingest the file.
	ingestBody, _ := json.Marshal(map[string]string{"file_id": fileID})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/ingest", bytes.NewReader(ingestBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("enqueue ingest: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var enqueueResp map[string]any
	json.NewDecoder(rec.Body).Decode(&enqueueResp)
	jobID := enqueueResp["id"].(string)
	if jobID == "" {
		t.Fatal("expected non-empty ingestion job id")
	}
	completed := waitForIngestionJobStatus(t, router, token, corpusID, jobID, "completed")
	if int(completed["chunk_count"].(float64)) == 0 {
		t.Error("expected chunk_count > 0")
	}

	// Search the corpus.
	searchBody, _ := json.Marshal(map[string]any{"query": "multi-agent AI", "top_k": 3})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/search", bytes.NewReader(searchBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("search: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var searchResp map[string]any
	json.NewDecoder(rec.Body).Decode(&searchResp)
	results, _ := searchResp["results"].([]any)
	if len(results) == 0 {
		t.Error("expected at least one search result")
	}
}

func TestKnowledgeSearchAcrossCorpora(t *testing.T) {
	app, _ := newKnowledgeTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@knowledge.test", "adminpass")

	createCorpus := func(name string) string {
		body, _ := json.Marshal(map[string]string{"name": name})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		var corpus map[string]any
		json.NewDecoder(rec.Body).Decode(&corpus)
		return corpus["id"].(string)
	}
	ingest := func(corpusID, content, filename string) {
		fileID := uploadTestFile(t, router, token, content, filename)
		ingestBody, _ := json.Marshal(map[string]string{"file_id": fileID})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/ingest", bytes.NewReader(ingestBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusAccepted {
			t.Fatalf("enqueue ingest: got %d, body=%s", rec.Code, rec.Body.String())
		}
		var enqueueResp map[string]any
		json.NewDecoder(rec.Body).Decode(&enqueueResp)
		waitForIngestionJobStatus(t, router, token, corpusID, enqueueResp["id"].(string), "completed")
	}

	corpusA := createCorpus("Engineering Docs")
	corpusB := createCorpus("Sales Docs")
	ingest(corpusA, "The Seshat engine is a powerful multi-agent AI framework that supports RAG retrieval.\n", "eng.txt")
	ingest(corpusB, "Our sales team closed a multi-agent AI framework deal with a new enterprise customer.\n", "sales.txt")

	searchBody, _ := json.Marshal(map[string]any{"query": "multi-agent AI framework", "top_k": 5})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/knowledge/search", bytes.NewReader(searchBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("knowledge search: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var searchResp struct {
		Results         []map[string]any `json:"results"`
		CorporaSearched int              `json:"corpora_searched"`
	}
	json.NewDecoder(rec.Body).Decode(&searchResp)
	if searchResp.CorporaSearched != 2 {
		t.Fatalf("expected both corpora to be searched, got %d", searchResp.CorporaSearched)
	}
	if len(searchResp.Results) < 2 {
		t.Fatalf("expected results from both corpora, got %d: %+v", len(searchResp.Results), searchResp.Results)
	}
	seenCorpora := map[string]bool{}
	for _, r := range searchResp.Results {
		seenCorpora[r["corpus_id"].(string)] = true
	}
	if !seenCorpora[corpusA] || !seenCorpora[corpusB] {
		t.Fatalf("expected results tagged with both corpus IDs, got %+v", searchResp.Results)
	}
}

func TestCorpusIngestionJobRetry(t *testing.T) {
	embedder := &stubEmbedder{
		dim:               8,
		failuresRemaining: 3,
		failureMessage:    "temporary embedder failure",
	}
	app, _ := newKnowledgeTestAppWithEmbedder(t, embedder)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@knowledge.test", "adminpass")

	body, _ := json.Marshal(map[string]string{"name": "Retry Corpus"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var corpus map[string]any
	json.NewDecoder(rec.Body).Decode(&corpus)
	corpusID := corpus["id"].(string)

	fileID := uploadTestFile(t, router, token, "retry me please", "retry.txt")

	ingestBody, _ := json.Marshal(map[string]string{"file_id": fileID})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/ingest", bytes.NewReader(ingestBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("enqueue ingest: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var enqueueResp map[string]any
	json.NewDecoder(rec.Body).Decode(&enqueueResp)
	jobID := enqueueResp["id"].(string)

	failed := waitForIngestionJobStatus(t, router, token, corpusID, jobID, "failed")
	if failed["last_error"] == "" {
		t.Fatal("expected last_error on failed job")
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora/"+corpusID+"/ingest/jobs", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list jobs: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var jobsResp map[string]any
	json.NewDecoder(rec.Body).Decode(&jobsResp)
	if int(jobsResp["count"].(float64)) != 1 {
		t.Fatalf("expected 1 ingestion job, got %v", jobsResp["count"])
	}

	embedder.SetFailuresRemaining(0)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/ingest/jobs/"+jobID+"/retry", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("retry ingest: got %d, body=%s", rec.Code, rec.Body.String())
	}
	retried := waitForIngestionJobStatus(t, router, token, corpusID, jobID, "completed")
	if int(retried["attempt_count"].(float64)) != 1 {
		t.Fatalf("expected attempt_count to restart at 1 after retry, got %v", retried["attempt_count"])
	}
	if int(retried["chunk_count"].(float64)) == 0 {
		t.Fatal("expected retried job to produce chunks")
	}
}

func TestCorpusCrossUserAccess(t *testing.T) {
	app, identity := newKnowledgeTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	adminToken := loginAs(t, router, "admin@knowledge.test", "adminpass")

	// Create a second user.
	ctx := context.Background()
	bobHash, err := db.HashPassword("bobpass")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	_, err = identity.CreateUser(ctx, db.CreateUserParams{
		Email:        "bob@test.com",
		PasswordHash: bobHash,
		DisplayName:  "Bob",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	bobToken := loginAs(t, router, "bob@test.com", "bobpass")

	// Admin creates corpus.
	body, _ := json.Marshal(map[string]string{"name": "Admin Corpus"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var corpus map[string]any
	json.NewDecoder(rec.Body).Decode(&corpus)
	corpusID := corpus["id"].(string)

	// Bob tries to GET the admin's corpus → 403.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora/"+corpusID, nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("cross-user corpus access: expected 403, got %d", rec.Code)
	}

	// Bob's list should not include admin's corpus.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora", nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var list map[string]any
	json.NewDecoder(rec.Body).Decode(&list)
	if int(list["count"].(float64)) != 0 {
		t.Errorf("bob's corpus list should be empty, got %v", list["count"])
	}
}

func TestCorpusDetachFile(t *testing.T) {
	app, _, vectorStore := newKnowledgeTestAppWithEmbedderAndVector(t, &stubEmbedder{dim: 8})
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@knowledge.test", "adminpass")

	body, _ := json.Marshal(map[string]string{"name": "Detach Test"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var corpus map[string]any
	json.NewDecoder(rec.Body).Decode(&corpus)
	corpusID := corpus["id"].(string)

	fileID := uploadTestFile(t, router, token, "some content that will be indexed", "doc.txt")

	// Ingest the file so detach has vectors + counters to clean up.
	ingestBody, _ := json.Marshal(map[string]string{"file_id": fileID})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/ingest", bytes.NewReader(ingestBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("enqueue ingest: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var enqueueResp map[string]any
	json.NewDecoder(rec.Body).Decode(&enqueueResp)
	jobID := enqueueResp["id"].(string)
	completed := waitForIngestionJobStatus(t, router, token, corpusID, jobID, "completed")
	if int(completed["chunk_count"].(float64)) == 0 {
		t.Fatal("expected detach test ingestion to create chunks")
	}
	if len(vectorStore.records[corpusID]) == 0 {
		t.Fatal("expected vectors to exist before detach")
	}

	// Detach.
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/corpora/"+corpusID+"/files/"+fileID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("detach: got %d, body=%s", rec.Code, rec.Body.String())
	}

	// List should be empty.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora/"+corpusID+"/files", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var fileList map[string]any
	json.NewDecoder(rec.Body).Decode(&fileList)
	if int(fileList["count"].(float64)) != 0 {
		t.Errorf("expected empty file list after detach, got %v", fileList["count"])
	}

	// Search should be empty because vectors were deleted.
	searchBody, _ := json.Marshal(map[string]any{"query": "indexed", "top_k": 3})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/search", bytes.NewReader(searchBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("search after detach: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var searchResp map[string]any
	json.NewDecoder(rec.Body).Decode(&searchResp)
	results, _ := searchResp["results"].([]any)
	if len(results) != 0 {
		t.Fatalf("expected no RAG results after detach, got %d", len(results))
	}
	if len(vectorStore.records[corpusID]) != 0 {
		t.Fatalf("expected vector namespace to be empty after detach, got %d records", len(vectorStore.records[corpusID]))
	}

	// Corpus chunk_count should be decremented back to zero.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora/"+corpusID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get corpus after detach: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var refreshedCorpus map[string]any
	json.NewDecoder(rec.Body).Decode(&refreshedCorpus)
	if int(refreshedCorpus["chunk_count"].(float64)) != 0 {
		t.Fatalf("expected corpus chunk_count to be 0 after detach, got %v", refreshedCorpus["chunk_count"])
	}
}

func TestCorpusDetachedPendingJobBecomesSkipped(t *testing.T) {
	app, _, _ := newKnowledgeTestAppWithoutRunner(t, &stubEmbedder{dim: 8})
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@knowledge.test", "adminpass")

	body, _ := json.Marshal(map[string]string{"name": "Detached Pending Job"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create corpus: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var corpus map[string]any
	json.NewDecoder(rec.Body).Decode(&corpus)
	corpusID := corpus["id"].(string)

	fileID := uploadTestFile(t, router, token, "pending content", "pending.txt")
	ingestBody, _ := json.Marshal(map[string]string{"file_id": fileID})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/ingest", bytes.NewReader(ingestBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("enqueue ingest: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var enqueueResp map[string]any
	json.NewDecoder(rec.Body).Decode(&enqueueResp)
	jobID := enqueueResp["id"].(string)

	req = httptest.NewRequest(http.MethodDelete, "/api/v1/corpora/"+corpusID+"/files/"+fileID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("detach before processing: got %d, body=%s", rec.Code, rec.Body.String())
	}

	localKnowledge, ok := app.backend.Knowledge.(*backendknowledge.Service)
	if !ok {
		t.Fatalf("expected local *knowledge.Service, got %T", app.backend.Knowledge)
	}
	processed, err := localKnowledge.ProcessNextIngestionJob(context.Background())
	if err != nil {
		t.Fatalf("ProcessNextIngestionJob: %v", err)
	}
	if !processed {
		t.Fatal("expected pending ingestion job to be processed")
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/corpora/"+corpusID+"/ingest/jobs/"+jobID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get skipped job: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var job map[string]any
	json.NewDecoder(rec.Body).Decode(&job)
	if job["status"] != "skipped" {
		t.Fatalf("expected skipped job status, got %v", job["status"])
	}
	if job["last_error"] != "corpus file detached before ingestion" {
		t.Fatalf("expected detached skip reason, got %v", job["last_error"])
	}
}

func TestCorpusRejectsForeignFiles(t *testing.T) {
	app, identity := newKnowledgeTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	aliceHash, err := db.HashPassword("alicepass")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := identity.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "alice@knowledge.test",
		PasswordHash: aliceHash,
		DisplayName:  "Alice",
	}); err != nil {
		t.Fatalf("create alice: %v", err)
	}
	bobHash, err := db.HashPassword("bobpass")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := identity.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "bob2@knowledge.test",
		PasswordHash: bobHash,
		DisplayName:  "Bob",
	}); err != nil {
		t.Fatalf("create bob: %v", err)
	}

	aliceToken := loginAs(t, router, "alice@knowledge.test", "alicepass")
	bobToken := loginAs(t, router, "bob2@knowledge.test", "bobpass")

	body, _ := json.Marshal(map[string]string{"name": "Alice Corpus"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create corpus: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var corpus map[string]any
	json.NewDecoder(rec.Body).Decode(&corpus)
	corpusID := corpus["id"].(string)

	foreignFileID := uploadTestFile(t, router, bobToken, "bob private file", "bob.txt")
	attachBody, _ := json.Marshal(map[string]string{"file_id": foreignFileID})

	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/files", bytes.NewReader(attachBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("attach foreign file: expected 403, got %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/ingest", bytes.NewReader(attachBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("ingest foreign file: expected 403, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestBuildRAGContextUsesAuthenticatedPrincipal(t *testing.T) {
	app, _ := newKnowledgeTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@knowledge.test", "adminpass")

	body, _ := json.Marshal(map[string]string{"name": "Prompt Corpus"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/corpora", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create corpus: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var corpus map[string]any
	json.NewDecoder(rec.Body).Decode(&corpus)
	corpusID := corpus["id"].(string)

	fileID := uploadTestFile(t, router, token, "Seshat knowledge is available during chat retrieval.", "rag.txt")
	ingestBody, _ := json.Marshal(map[string]string{"file_id": fileID})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/corpora/"+corpusID+"/ingest", bytes.NewReader(ingestBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("enqueue ingest: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var enqueueResp map[string]any
	json.NewDecoder(rec.Body).Decode(&enqueueResp)
	waitForIngestionJobStatus(t, router, token, corpusID, enqueueResp["id"].(string), "completed")

	principal, err := app.backend.Auth.ResolvePrincipal(context.Background(), token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	resp, searchErr := app.backend.Knowledge.Search(context.Background(), principal, backendknowledge.SearchParams{
		CorpusID: corpusID,
		Query:    "knowledge retrieval",
		TopK:     5,
	})
	if searchErr != nil {
		t.Fatalf("knowledge search: %v", searchErr)
	}
	if len(resp.Results) == 0 {
		t.Fatal("expected at least one RAG result after ingestion")
	}
}

// newPlansTestApp wires up a minimal App with plan store and auth.
func newPlansTestApp(t *testing.T) (*App, *db.IdentityStore, *db.PlanDocumentStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "plans-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	apiKeyStore, err := db.NewAPIKeyStore(database)
	if err != nil {
		t.Fatalf("NewAPIKeyStore: %v", err)
	}
	fileStore, err := db.NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	corpusStore, err := db.NewCorpusStore(database)
	if err != nil {
		t.Fatalf("NewCorpusStore: %v", err)
	}
	webSearchSettingStore, err := db.NewWebSearchSettingStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchSettingStore: %v", err)
	}
	webSearchLogStore, err := db.NewWebSearchLogStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchLogStore: %v", err)
	}
	planStore, err := db.NewPlanDocumentStore(database)
	if err != nil {
		t.Fatalf("NewPlanDocumentStore: %v", err)
	}

	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@plans.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "TestOrg",
		DefaultOrgSlug:       "testorg",
		DefaultWorkspaceName: "Main",
		DefaultWorkspaceSlug: "main",
	}); err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	app := &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity:          identity,
			APIKeyStore:       apiKeyStore,
			FileStore:         fileStore,
			ArtifactStore:     newStubArtifactStore(),
			CorpusStore:       corpusStore,
			WebSearchSettings: webSearchSettingStore,
			WebSearchLogs:     webSearchLogStore,
			PlanDocumentStore: planStore,
		}),
		enableAPIKeys: true,
	}
	return app, identity, planStore
}

// createPlanUser creates a member user for plan tests.
func createPlanUser(t *testing.T, identity *db.IdentityStore, email, password string) *db.User {
	t.Helper()
	hash, err := db.HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	user, err := identity.CreateUser(context.Background(), db.CreateUserParams{
		Email:        email,
		DisplayName:  email,
		PasswordHash: hash,
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if err := identity.AssignRoleToUser(context.Background(), user.ID, "member"); err != nil {
		t.Fatalf("AssignRoleToUser: %v", err)
	}
	return user
}

// seedPlan inserts a plan belonging to userID in sessionID.
func seedPlan(t *testing.T, store *db.PlanDocumentStore, planID, sessionID, userID string) *db.PlanDocument {
	t.Helper()
	plan, err := store.Create(context.Background(), db.CreatePlanParams{
		ID:        planID,
		SessionID: sessionID,
		UserID:    userID,
		Slug:      "test-plan",
		Filename:  "plan.md",
		Content:   "# Test Plan",
	})
	if err != nil {
		t.Fatalf("seedPlan: %v", err)
	}
	return plan
}

// TestPlans_AnonymousAccessDenied verifies all plan endpoints require auth.
func TestPlans_AnonymousAccessDenied(t *testing.T) {
	app, _, _ := newPlansTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	cases := []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodGet, "/api/v1/plans?session_id=sess1", ""},
		{http.MethodGet, "/api/v1/plans/some-plan-id", ""},
		{http.MethodPatch, "/api/v1/plans/some-plan-id", `{"content":"x"}`},
	}

	for _, tc := range cases {
		var bodyReader *bytes.Reader
		if tc.body != "" {
			bodyReader = bytes.NewReader([]byte(tc.body))
		} else {
			bodyReader = bytes.NewReader(nil)
		}
		req := httptest.NewRequest(tc.method, tc.path, bodyReader)
		if tc.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: expected 401, got %d (body=%s)", tc.method, tc.path, rec.Code, rec.Body.String())
		}
	}
}

// TestPlans_AuthorizedAccess verifies an owner can read their plans.
func TestPlans_AuthorizedAccess(t *testing.T) {
	app, identity, store := newPlansTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	user := createPlanUser(t, identity, "owner@plans.test", "pass1")
	token := loginAs(t, router, user.Email, "pass1")

	plan := seedPlan(t, store, "plan-owner-1", "sess-owner", user.ID)

	// List by session
	req := httptest.NewRequest(http.MethodGet, "/api/v1/plans?session_id=sess-owner", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list own plans: expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var listResp map[string]any
	json.NewDecoder(rec.Body).Decode(&listResp)
	plans, _ := listResp["plans"].([]any)
	if len(plans) != 1 {
		t.Fatalf("expected 1 plan, got %d", len(plans))
	}

	// Get by ID
	req = httptest.NewRequest(http.MethodGet, "/api/v1/plans/"+plan.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get own plan: expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	// Patch by ID
	body, _ := json.Marshal(map[string]string{"content": "updated"})
	req = httptest.NewRequest(http.MethodPatch, "/api/v1/plans/"+plan.ID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch own plan: expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// TestPlans_CrossUserGetDenied verifies user2 cannot GET user1's plan.
func TestPlans_CrossUserGetDenied(t *testing.T) {
	app, identity, store := newPlansTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	user1 := createPlanUser(t, identity, "user1@plans.test", "pass1")
	user2 := createPlanUser(t, identity, "user2@plans.test", "pass2")
	token2 := loginAs(t, router, user2.Email, "pass2")

	plan := seedPlan(t, store, "plan-cross-1", "sess-user1", user1.ID)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/plans/"+plan.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token2)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("cross-user GET: expected 403, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// TestPlans_CrossUserPatchDenied verifies user2 cannot PATCH user1's plan.
func TestPlans_CrossUserPatchDenied(t *testing.T) {
	app, identity, store := newPlansTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	user1 := createPlanUser(t, identity, "u1-patch@plans.test", "pass1")
	user2 := createPlanUser(t, identity, "u2-patch@plans.test", "pass2")
	token2 := loginAs(t, router, user2.Email, "pass2")

	plan := seedPlan(t, store, "plan-patch-1", "sess-u1-patch", user1.ID)

	body, _ := json.Marshal(map[string]string{"content": "hacked"})
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/plans/"+plan.ID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token2)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("cross-user PATCH: expected 403, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// TestPlans_ListFilteredByUser verifies the list endpoint only returns the caller's plans.
func TestPlans_ListFilteredByUser(t *testing.T) {
	app, identity, store := newPlansTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	user1 := createPlanUser(t, identity, "list1@plans.test", "pass1")
	user2 := createPlanUser(t, identity, "list2@plans.test", "pass2")
	token1 := loginAs(t, router, user1.Email, "pass1")
	token2 := loginAs(t, router, user2.Email, "pass2")

	sharedSessionID := "shared-session-abc"
	// Both users have plans in the same session
	seedPlan(t, store, "plan-list-u1-a", sharedSessionID, user1.ID)
	seedPlan(t, store, "plan-list-u1-b", sharedSessionID, user1.ID)
	seedPlan(t, store, "plan-list-u2-a", sharedSessionID, user2.ID)

	// user1 must only see their own plans
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/plans?session_id=%s", sharedSessionID), nil)
	req.Header.Set("Authorization", "Bearer "+token1)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("user1 list: expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var resp1 map[string]any
	json.NewDecoder(rec.Body).Decode(&resp1)
	plans1 := resp1["plans"].([]any)
	if len(plans1) != 2 {
		t.Errorf("user1 should see 2 plans, got %d", len(plans1))
	}

	// user2 must only see their own plan
	req = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/v1/plans?session_id=%s", sharedSessionID), nil)
	req.Header.Set("Authorization", "Bearer "+token2)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("user2 list: expected 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var resp2 map[string]any
	json.NewDecoder(rec.Body).Decode(&resp2)
	plans2 := resp2["plans"].([]any)
	if len(plans2) != 1 {
		t.Errorf("user2 should see 1 plan, got %d", len(plans2))
	}
}

// TestPlans_PlanNotFound verifies 404 for a non-existent plan.
func TestPlans_PlanNotFound(t *testing.T) {
	app, identity, _ := newPlansTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	user := createPlanUser(t, identity, "notfound@plans.test", "pass1")
	token := loginAs(t, router, user.Email, "pass1")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/plans/nonexistent-plan-id", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// TestPlans_SessionBelongingToOtherUser verifies that user2 listing user1's session sees no plans.
func TestPlans_SessionBelongingToOtherUser(t *testing.T) {
	app, identity, store := newPlansTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	user1 := createPlanUser(t, identity, "sess-owner@plans.test", "pass1")
	user2 := createPlanUser(t, identity, "sess-attacker@plans.test", "pass2")
	token2 := loginAs(t, router, user2.Email, "pass2")

	seedPlan(t, store, "plan-sess-1", "user1-only-session", user1.ID)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/plans?session_id=user1-only-session", nil)
	req.Header.Set("Authorization", "Bearer "+token2)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (empty list), got %d (%s)", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(rec.Body).Decode(&resp)
	plans := resp["plans"].([]any)
	if len(plans) != 0 {
		t.Errorf("user2 must see 0 plans from user1 session, got %d", len(plans))
	}
}

// TestPlans_MissingSessionID verifies that omitting session_id returns 400.
func TestPlans_MissingSessionID(t *testing.T) {
	app, identity, _ := newPlansTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	user := createPlanUser(t, identity, "nosession@plans.test", "pass1")
	token := loginAs(t, router, user.Email, "pass1")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/plans", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing session_id, got %d (%s)", rec.Code, rec.Body.String())
	}
}

// TestPlans_RouteCompatibility verifies that all routes used by seshat-ui are still registered.
func TestPlans_RouteCompatibility(t *testing.T) {
	app, identity, store := newPlansTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	user := createPlanUser(t, identity, "compat@plans.test", "pass1")
	token := loginAs(t, router, user.Email, "pass1")
	plan := seedPlan(t, store, "plan-compat-1", "sess-compat", user.ID)

	routes := []struct {
		method string
		path   string
		body   string
		want   int
	}{
		{http.MethodGet, "/api/v1/plans?session_id=sess-compat", "", http.StatusOK},
		{http.MethodGet, "/api/v1/plans/" + plan.ID, "", http.StatusOK},
		{http.MethodPatch, "/api/v1/plans/" + plan.ID, `{"status":"validated"}`, http.StatusOK},
	}

	for _, tc := range routes {
		var bodyReader *bytes.Reader
		if tc.body != "" {
			bodyReader = bytes.NewReader([]byte(tc.body))
		} else {
			bodyReader = bytes.NewReader(nil)
		}
		req := httptest.NewRequest(tc.method, tc.path, bodyReader)
		req.Header.Set("Authorization", "Bearer "+token)
		if tc.body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Errorf("route %s %s: expected %d, got %d (%s)", tc.method, tc.path, tc.want, rec.Code, rec.Body.String())
		}
	}
}

func createProviderSettingForTest(t *testing.T, router http.Handler, token, provider, name string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{
		"provider": provider,
		"name":     name,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create setting: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var payload map[string]any
	json.NewDecoder(rec.Body).Decode(&payload)
	return payload["id"].(string)
}

func createProviderModelForTest(t *testing.T, router http.Handler, token, settingID, modelID string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{
		"model_id":     modelID,
		"display_name": modelID,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers/"+settingID+"/models", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create model: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var payload map[string]any
	json.NewDecoder(rec.Body).Decode(&payload)
	return payload["id"].(string)
}

func TestProviderModelRoutesAreScopedToSetting(t *testing.T) {
	app, identity := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	adminToken := loginAs(t, router, "admin@settings.test", "adminpass")

	bobHash, err := db.HashPassword("bobpass")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := identity.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "bob-models@settings.test",
		PasswordHash: bobHash,
		DisplayName:  "Bob",
	}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	bobToken := loginAs(t, router, "bob-models@settings.test", "bobpass")

	adminSettingID := createProviderSettingForTest(t, router, adminToken, "openai", "Admin OpenAI")
	bobSettingID := createProviderSettingForTest(t, router, bobToken, "openai", "Bob OpenAI")
	adminModelID := createProviderModelForTest(t, router, adminToken, adminSettingID, "admin-model")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/"+bobSettingID+"/models/"+adminModelID, nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-setting GET: expected 404, got %d body=%s", rec.Code, rec.Body.String())
	}

	updateBody, _ := json.Marshal(map[string]any{"display_name": "hijacked"})
	req = httptest.NewRequest(http.MethodPut, "/api/v1/settings/providers/"+bobSettingID+"/models/"+adminModelID, bytes.NewReader(updateBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-setting PUT: expected 404, got %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/v1/settings/providers/"+bobSettingID+"/models/"+adminModelID, nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-setting DELETE: expected 404, got %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/"+adminSettingID+"/models/"+adminModelID, nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner GET after cross-setting attempts: got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestFetchOllamaModelsFiltersEmbeddingModels(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"models": [
					{"name":"bge-m3:latest","details":{"family":"bert","families":["bert"]}},
					{"name":"mistral:latest","details":{"family":"llama","families":["llama"]}},
					{"name":"llama3.2:latest","details":{"family":"llama","families":["llama"]}}
				]
			}`))
		case "/api/show":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"model_info":{"llama.context_length":8192}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	models, err := providers.FetchModels(context.Background(), "ollama", server.URL, "")
	if err != nil {
		t.Fatalf("FetchModels returned error: %v", err)
	}
	if len(models) != 2 {
		t.Fatalf("expected 2 chat-capable models after filtering, got %d", len(models))
	}
	if models[0].ModelID != "mistral:latest" {
		t.Fatalf("expected mistral:latest as first chat model, got %q", models[0].ModelID)
	}
	if !models[0].IsDefault {
		t.Fatal("expected first remaining chat model to become the default")
	}
	for _, model := range models {
		if model.ModelID == "bge-m3:latest" {
			t.Fatal("embedding model should have been filtered out")
		}
	}
}

func TestFetchOllamaModelsFallsBackWhenNoChatModelDetected(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"models": [
					{"name":"nomic-embed-text:latest","details":{"family":"bert","families":["bert"]}}
				]
			}`))
		case "/api/show":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"model_info":{"llama.context_length":2048}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	models, err := providers.FetchModels(context.Background(), "ollama", server.URL, "")
	if err != nil {
		t.Fatalf("FetchModels returned error: %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("expected fallback to preserve the original model list, got %d models", len(models))
	}
	if models[0].ModelID != "nomic-embed-text:latest" {
		t.Fatalf("expected fallback model to be preserved, got %q", models[0].ModelID)
	}
	if !models[0].IsDefault {
		t.Fatal("expected the preserved fallback model to remain default")
	}
}

type fakeSessionHandle struct {
	id sdk.SessionID
}

func (h fakeSessionHandle) GetID() sdk.SessionID { return h.id }
func (h fakeSessionHandle) Close() error         { return nil }

type capturingQueryRuntime struct {
	mu        sync.Mutex
	nextID    int
	sessions  map[string]*sdk.SessionInfo
	runInputs []backendquery.QueryInput
}

func newCapturingQueryRuntime() *capturingQueryRuntime {
	return &capturingQueryRuntime{
		sessions: map[string]*sdk.SessionInfo{},
	}
}

func (r *capturingQueryRuntime) RunPrompt(_ context.Context, input backendquery.QueryInput) (*backendquery.QueryResult, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now().Unix()
	sessionID := input.SessionID
	if sessionID == "" {
		r.nextID++
		sessionID = fmt.Sprintf("sess-%d", r.nextID)
		r.sessions[sessionID] = &sdk.SessionInfo{
			ID:        sdk.SessionID(sessionID),
			Status:    sdk.SessionStatusActive,
			CreatedAt: now,
			UpdatedAt: now,
		}
	}
	info := r.sessions[sessionID]
	if info == nil {
		info = &sdk.SessionInfo{
			ID:        sdk.SessionID(sessionID),
			Status:    sdk.SessionStatusActive,
			CreatedAt: now,
		}
		r.sessions[sessionID] = info
	}
	info.TotalTurns++
	info.UpdatedAt = now
	r.runInputs = append(r.runInputs, input)

	content := "default"
	if input.RuntimeProvider != nil {
		content = input.RuntimeProvider.SettingID + "|" + input.RuntimeProvider.Secret
	}
	return &backendquery.QueryResult{
		SessionID:   sessionID,
		Content:     content,
		StopReason:  types.StopReasonEndTurn,
		TurnNumber:  info.TotalTurns,
		IsComplete:  true,
		ToolUses:    nil,
		ToolResults: nil,
	}, nil
}

func (r *capturingQueryRuntime) ListSessions() ([]*sdk.SessionInfo, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	result := make([]*sdk.SessionInfo, 0, len(r.sessions))
	for _, info := range r.sessions {
		cloned := *info
		result = append(result, &cloned)
	}
	return result, nil
}

func (r *capturingQueryRuntime) CreateSession(_ context.Context) (backendquery.SessionHandle, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.nextID++
	sessionID := fmt.Sprintf("sess-%d", r.nextID)
	now := time.Now().Unix()
	r.sessions[sessionID] = &sdk.SessionInfo{
		ID:        sdk.SessionID(sessionID),
		Status:    sdk.SessionStatusActive,
		CreatedAt: now,
		UpdatedAt: now,
	}
	return fakeSessionHandle{id: sdk.SessionID(sessionID)}, nil
}

func (r *capturingQueryRuntime) DeleteSession(sessionID sdk.SessionID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sessions, sessionID.String())
	return nil
}

func (r *capturingQueryRuntime) lastInput(t *testing.T) backendquery.QueryInput {
	t.Helper()
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.runInputs) == 0 {
		t.Fatal("expected at least one runtime input")
	}
	return r.runInputs[len(r.runInputs)-1]
}

func newQueryProviderTestApp(t *testing.T, runtime *capturingQueryRuntime, oauthFactory bksettings.OAuthClientFactory) *App {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "query-provider.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ownership, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}
	settingStore, err := db.NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	oauthStore, err := db.NewProviderOAuthConnectionStore(database)
	if err != nil {
		t.Fatalf("NewProviderOAuthConnectionStore: %v", err)
	}

	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@query.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	}); err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	return &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity:         identity,
			QueryRuntime:     runtime,
			SessionManager:   runtime,
			SessionOwnership: ownership,
			SettingStore:     settingStore,
			OAuthStore:       oauthStore,
			OAuthClients:     oauthFactory,
		}),
	}
}

func createProviderSettingViaAPI(t *testing.T, router http.Handler, token string, body map[string]any) map[string]any {
	t.Helper()
	payload, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create provider setting: got %d body=%s", rec.Code, rec.Body.String())
	}
	var response map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode create provider setting: %v", err)
	}
	return response
}

func TestQueryBindsAPIKeyProviderSettingToSession(t *testing.T) {
	runtime := newCapturingQueryRuntime()
	app := newQueryProviderTestApp(t, runtime, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@query.test", "adminpass")

	setting := createProviderSettingViaAPI(t, router, token, map[string]any{
		"provider": "openai",
		"name":     "OpenAI User Key",
		"model_id": "gpt-4o-mini",
		"api_key":  "sk-provider-secret",
	})
	settingID := setting["id"].(string)

	body, _ := json.Marshal(map[string]any{
		"prompt":              "hello",
		"provider_setting_id": settingID,
		"model_id":            "gpt-4o",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("query with provider setting: got %d body=%s", rec.Code, rec.Body.String())
	}

	var firstResp queryResponse
	if err := json.NewDecoder(rec.Body).Decode(&firstResp); err != nil {
		t.Fatalf("decode query response: %v", err)
	}
	lastInput := runtime.lastInput(t)
	if lastInput.RuntimeProvider == nil {
		t.Fatal("expected runtime provider config to be resolved")
	}
	if lastInput.RuntimeProvider.SettingID != settingID {
		t.Fatalf("expected runtime setting %q, got %q", settingID, lastInput.RuntimeProvider.SettingID)
	}
	if lastInput.RuntimeProvider.Secret != "sk-provider-secret" {
		t.Fatalf("expected decrypted api key, got %q", lastInput.RuntimeProvider.Secret)
	}
	if lastInput.RuntimeProvider.ModelID != "gpt-4o" {
		t.Fatalf("expected runtime model %q, got %q", "gpt-4o", lastInput.RuntimeProvider.ModelID)
	}

	body, _ = json.Marshal(map[string]any{
		"prompt":     "continue",
		"session_id": firstResp.SessionID,
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/query", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("query with bound session: got %d body=%s", rec.Code, rec.Body.String())
	}
	lastInput = runtime.lastInput(t)
	if lastInput.RuntimeProvider == nil || lastInput.RuntimeProvider.SettingID != settingID {
		t.Fatalf("expected bound provider setting %q on follow-up query, got %#v", settingID, lastInput.RuntimeProvider)
	}
	if lastInput.RuntimeProvider.ModelID != "gpt-4o" {
		t.Fatalf("expected bound model %q on follow-up query, got %#v", "gpt-4o", lastInput.RuntimeProvider)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/sessions", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list sessions: got %d body=%s", rec.Code, rec.Body.String())
	}
	var sessionsResp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&sessionsResp); err != nil {
		t.Fatalf("decode sessions response: %v", err)
	}
	sessions := sessionsResp["sessions"].([]any)
	session := sessions[0].(map[string]any)
	if session["provider_setting_id"] != settingID {
		t.Fatalf("expected provider_setting_id %q in session list, got %v", settingID, session["provider_setting_id"])
	}
	if session["model_id"] != "gpt-4o" {
		t.Fatalf("expected model_id %q in session list, got %v", "gpt-4o", session["model_id"])
	}

	otherSetting := createProviderSettingViaAPI(t, router, token, map[string]any{
		"provider": "openai",
		"name":     "Other Key",
		"model_id": "gpt-4o-mini",
		"api_key":  "sk-other-secret",
	})
	body, _ = json.Marshal(map[string]any{
		"prompt":              "switch",
		"session_id":          firstResp.SessionID,
		"provider_setting_id": otherSetting["id"],
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/query", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected provider switch rejection 400, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestQueryUsesOAuthProviderSettingFromBoundSession(t *testing.T) {
	oauthFactory := fakeOAuthClientFactory{
		clients: map[string]*fakeOAuthClient{
			"openai": {
				deviceCodeResp: &bksettings.OAuthDeviceCodeResponse{
					DeviceCode:      "device-code",
					UserCode:        "ABCD",
					VerificationURL: "https://example.test/verify",
					ExpiresIn:       600,
					Interval:        1,
				},
				exchangeQueue: []fakeOAuthExchangeResult{
					{
						token: &bksettings.OAuthTokenResponse{
							AccessToken:  "oauth-access-token",
							RefreshToken: "oauth-refresh-token",
							IDToken:      "",
							Scope:        "openid profile email",
							ExpiresIn:    3600,
						},
					},
				},
			},
		},
	}
	runtime := newCapturingQueryRuntime()
	app := newQueryProviderTestApp(t, runtime, oauthFactory)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@query.test", "adminpass")

	setting := createProviderSettingViaAPI(t, router, token, map[string]any{
		"provider":  "openai",
		"name":      "ChatGPT Account",
		"auth_kind": "oauth",
		"model_id":  "gpt-4o",
	})
	settingID := setting["id"].(string)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers/"+settingID+"/oauth/start", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("oauth start: got %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers/"+settingID+"/oauth/poll", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("oauth poll: got %d body=%s", rec.Code, rec.Body.String())
	}

	createSessionBody, _ := json.Marshal(map[string]any{
		"provider_setting_id": settingID,
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/sessions", bytes.NewReader(createSessionBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create session with oauth provider: got %d body=%s", rec.Code, rec.Body.String())
	}
	var createSessionResp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&createSessionResp); err != nil {
		t.Fatalf("decode create session response: %v", err)
	}
	sessionID := createSessionResp["session_id"].(string)

	queryBody, _ := json.Marshal(map[string]any{
		"prompt":     "hello from oauth",
		"session_id": sessionID,
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/query", bytes.NewReader(queryBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("query with oauth-bound session: got %d body=%s", rec.Code, rec.Body.String())
	}

	lastInput := runtime.lastInput(t)
	if lastInput.RuntimeProvider == nil {
		t.Fatal("expected oauth runtime provider config")
	}
	if lastInput.RuntimeProvider.SettingID != settingID {
		t.Fatalf("expected oauth runtime setting %q, got %q", settingID, lastInput.RuntimeProvider.SettingID)
	}
	if lastInput.RuntimeProvider.Secret != "oauth-access-token" {
		t.Fatalf("expected oauth access token, got %q", lastInput.RuntimeProvider.Secret)
	}
}

func TestCreateSessionPersistsProviderModelSelection(t *testing.T) {
	runtime := newCapturingQueryRuntime()
	app := newQueryProviderTestApp(t, runtime, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@query.test", "adminpass")

	setting := createProviderSettingViaAPI(t, router, token, map[string]any{
		"provider": "openai",
		"name":     "OpenAI User Key",
		"model_id": "gpt-4o-mini",
		"api_key":  "sk-provider-secret",
	})
	settingID := setting["id"].(string)

	body, _ := json.Marshal(map[string]any{
		"provider_setting_id": settingID,
		"model_id":            "gpt-4.1-mini",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/sessions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create session with provider/model: got %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/sessions", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list sessions: got %d body=%s", rec.Code, rec.Body.String())
	}

	var sessionsResp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&sessionsResp); err != nil {
		t.Fatalf("decode sessions response: %v", err)
	}
	sessions := sessionsResp["sessions"].([]any)
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	session := sessions[0].(map[string]any)
	if session["provider_setting_id"] != settingID {
		t.Fatalf("expected provider_setting_id %q, got %v", settingID, session["provider_setting_id"])
	}
	if session["model_id"] != "gpt-4.1-mini" {
		t.Fatalf("expected model_id %q, got %v", "gpt-4.1-mini", session["model_id"])
	}
}

// stubStreamingRunner implements both queryRunner and streamingQueryRunner.
// It emits the configured chunks via onChunk before returning the canned result.
type stubStreamingRunner struct {
	chunks        []sdk.ResponseChunk
	runtimeEvents []sdk.RuntimeEvent
	result        *queryExecutionResult
	err           error
}

func (s *stubStreamingRunner) RunPrompt(_ context.Context, _ backendquery.QueryInput) (*queryExecutionResult, error) {
	return s.result, s.err
}

func (s *stubStreamingRunner) StreamPrompt(_ context.Context, _ backendquery.QueryInput, onChunk func(sdk.ResponseChunk), onRuntimeEvent func(sdk.RuntimeEvent)) (*queryExecutionResult, error) {
	for _, c := range s.chunks {
		onChunk(c)
	}
	for _, event := range s.runtimeEvents {
		onRuntimeEvent(event)
	}
	return s.result, s.err
}

// sseLines parses a raw SSE response body into a slice of (event, data) pairs.
// Empty lines (separators) are skipped. Lines without a prefix are ignored.
type sseLine struct {
	event string // empty string = default "message" event
	data  string
}

func parseSSELines(body string) []sseLine {
	var lines []sseLine
	var cur sseLine
	scanner := bufio.NewScanner(strings.NewReader(body))
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if cur.data != "" {
				lines = append(lines, cur)
			}
			cur = sseLine{}
			continue
		}
		if strings.HasPrefix(line, "event: ") {
			cur.event = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			cur.data = strings.TrimPrefix(line, "data: ")
		}
	}
	if cur.data != "" {
		lines = append(lines, cur)
	}
	return lines
}

func newStreamApp(runner queryRunner) *App {
	return &App{
		backend: seshat.NewApp(seshat.Dependencies{
			QueryRuntime: runner,
		}),
	}
}

// TestHandleQueryStream_MethodNotAllowed verifies the handler rejects non-POST requests.
func TestHandleQueryStream_MethodNotAllowed(t *testing.T) {
	app := newStreamApp(&stubStreamingRunner{result: &queryExecutionResult{}})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/query/stream", nil)
	rr := httptest.NewRecorder()
	app.handleQueryStream(rr, req)
	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rr.Code)
	}
}

// TestHandleQueryStream_MissingPrompt verifies the handler rejects requests without a prompt.
func TestHandleQueryStream_MissingPrompt(t *testing.T) {
	app := newStreamApp(&stubStreamingRunner{result: &queryExecutionResult{}})
	body, _ := json.Marshal(queryRequest{Prompt: "   "})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query/stream", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	app.handleQueryStream(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

// TestHandleQueryStream_NonStreamingRunnerReturns501 verifies that a queryRunner
// that does not implement streamingQueryRunner gets a 501.
func TestHandleQueryStream_NonStreamingRunnerReturns501(t *testing.T) {
	// stubQueryRunner (from auth_test.go) only implements RunPrompt.
	app := newStreamApp(stubQueryRunner{})
	body, _ := json.Marshal(queryRequest{Prompt: "hello"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query/stream", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	app.handleQueryStream(rr, req)
	if rr.Code != http.StatusNotImplemented {
		t.Fatalf("expected 501, got %d", rr.Code)
	}
}

// TestHandleQueryStream_SSEHeaders verifies SSE-specific response headers are set.
func TestHandleQueryStream_SSEHeaders(t *testing.T) {
	runner := &stubStreamingRunner{
		chunks: nil,
		result: &queryExecutionResult{
			SessionID:  "s1",
			Content:    "done",
			StopReason: types.StopReasonEndTurn,
			IsComplete: true,
		},
	}
	app := newStreamApp(runner)
	body, _ := json.Marshal(queryRequest{Prompt: "hi"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query/stream", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	app.handleQueryStream(rr, req)

	ct := rr.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "text/event-stream") {
		t.Errorf("expected text/event-stream Content-Type, got %q", ct)
	}
	if rr.Header().Get("Cache-Control") != "no-cache" {
		t.Errorf("expected Cache-Control: no-cache, got %q", rr.Header().Get("Cache-Control"))
	}
	if rr.Header().Get("X-Accel-Buffering") != "no" {
		t.Errorf("expected X-Accel-Buffering: no, got %q", rr.Header().Get("X-Accel-Buffering"))
	}
}

// TestHandleQueryStream_ChunksAndDoneEvent verifies that each chunk produces a
// data SSE event and the final result arrives as an "event: done" event.
func TestHandleQueryStream_ChunksAndDoneEvent(t *testing.T) {
	chunks := []sdk.ResponseChunk{
		{Type: types.APIChunkTypeContentBlockDelta, DeltaType: "text_delta", Delta: "hel"},
		{Type: types.APIChunkTypeContentBlockDelta, DeltaType: "text_delta", Delta: "lo"},
	}
	runner := &stubStreamingRunner{
		chunks: chunks,
		result: &queryExecutionResult{
			SessionID:  "sess-42",
			Content:    "hello",
			StopReason: types.StopReasonEndTurn,
			TurnNumber: 1,
			IsComplete: true,
		},
	}
	app := newStreamApp(runner)
	body, _ := json.Marshal(queryRequest{Prompt: "ping"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query/stream", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	app.handleQueryStream(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	sseLines := parseSSELines(rr.Body.String())

	// Count chunk events (no event: prefix) and done events.
	var chunkEvents, doneEvents int
	for _, line := range sseLines {
		if line.event == "" {
			chunkEvents++
		} else if line.event == "done" {
			doneEvents++
		}
	}

	if chunkEvents != len(chunks) {
		t.Errorf("expected %d chunk events, got %d", len(chunks), chunkEvents)
	}
	if doneEvents != 1 {
		t.Errorf("expected 1 done event, got %d", doneEvents)
	}

	// Verify the done event payload.
	var doneEvent sseLine
	for _, line := range sseLines {
		if line.event == "done" {
			doneEvent = line
			break
		}
	}
	var resp queryResponse
	if err := json.Unmarshal([]byte(doneEvent.data), &resp); err != nil {
		t.Fatalf("failed to parse done event data: %v — raw: %q", err, doneEvent.data)
	}
	if resp.SessionID != "sess-42" {
		t.Errorf("expected session_id sess-42, got %q", resp.SessionID)
	}
	if resp.Content != "hello" {
		t.Errorf("expected content hello, got %q", resp.Content)
	}
	if resp.StopReason != types.StopReasonEndTurn {
		t.Errorf("expected stop_reason end_turn, got %q", resp.StopReason)
	}
}

// TestHandleQueryStream_ChunkPayloadFields verifies the data payload of a chunk event
// mirrors the structured API response chunk contract instead of an HTTP-specific wrapper.
func TestHandleQueryStream_ChunkPayloadFields(t *testing.T) {
	chunks := []sdk.ResponseChunk{
		{Type: types.APIChunkTypeContentBlockDelta, DeltaType: "text_delta", Delta: "hi"},
	}
	runner := &stubStreamingRunner{
		chunks: chunks,
		result: &queryExecutionResult{Content: "hi", StopReason: types.StopReasonEndTurn, IsComplete: true},
	}
	app := newStreamApp(runner)
	body, _ := json.Marshal(queryRequest{Prompt: "test"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query/stream", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	app.handleQueryStream(rr, req)

	sseLines := parseSSELines(rr.Body.String())
	var chunkLine sseLine
	for _, line := range sseLines {
		if line.event == "" {
			chunkLine = line
			break
		}
	}
	if chunkLine.data == "" {
		t.Fatal("expected at least one chunk event")
	}

	var payload types.APIResponseChunk
	if err := json.Unmarshal([]byte(chunkLine.data), &payload); err != nil {
		t.Fatalf("chunk data is not valid JSON: %v", err)
	}

	if payload.Type != types.APIChunkTypeContentBlockDelta {
		t.Errorf("expected type=%s, got %s", types.APIChunkTypeContentBlockDelta, payload.Type)
	}
	if payload.DeltaType != "text_delta" {
		t.Errorf("expected delta_type=text_delta, got %q", payload.DeltaType)
	}
	if payload.Delta != "hi" {
		t.Errorf("expected delta=hi, got %q", payload.Delta)
	}
}

// TestHandleQueryStream_ErrorEvent verifies that a StreamPrompt failure emits an
// "event: error" SSE event instead of an HTTP error status.
func TestHandleQueryStream_ErrorEvent(t *testing.T) {
	runner := &stubStreamingRunner{
		err: fmt.Errorf("provider unavailable"),
	}
	app := newStreamApp(runner)
	body, _ := json.Marshal(queryRequest{Prompt: "fail"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query/stream", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	app.handleQueryStream(rr, req)

	// Status is 200 (SSE already started) — error is in the stream.
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 (SSE stream), got %d", rr.Code)
	}

	sseLines := parseSSELines(rr.Body.String())
	var errorEvents int
	for _, line := range sseLines {
		if line.event == "error" {
			errorEvents++
			var payload map[string]string
			if err := json.Unmarshal([]byte(line.data), &payload); err != nil {
				t.Errorf("error event data is not valid JSON: %v", err)
			}
			if !strings.Contains(payload["error"], "unavailable") {
				t.Errorf("expected error message to contain 'unavailable', got %q", payload["error"])
			}
		}
	}
	if errorEvents != 1 {
		t.Errorf("expected 1 error event, got %d", errorEvents)
	}
}

// TestBuildQueryInput_AppendSystemPromptPassedThrough vérifie que append_system_prompt
// du request est bien transmis dans le QueryInput — régression pour le bug où le chemin
// SSE ignorait complètement ce champ.
// Note: the Pro prompt block is always appended after the caller's content.
func TestBuildQueryInput_AppendSystemPromptPassedThrough(t *testing.T) {
	app := newStreamApp(stubQueryRunner{})
	extra := "always answer in French"
	input, _ := app.backend.Query.BuildContextInput(context.Background(), backendquery.ContextBuildParams{
		Prompt:             "hello",
		AppendSystemPrompt: &extra,
	})
	if input.AppendSystemPrompt == nil {
		t.Fatal("AppendSystemPrompt should not be nil")
	}
	// Caller's content must be present; Pro block is appended after it.
	if !strings.Contains(*input.AppendSystemPrompt, extra) {
		t.Errorf("expected caller content %q in AppendSystemPrompt, got %q", extra, *input.AppendSystemPrompt)
	}
}

// TestBuildQueryInput_AppendSystemPromptOnlyRenderingCapabilities verifies
// that when no memories, preferences, or explicit system prompt are
// configured, BuildContextInput injects nothing beyond the static
// rendering-capabilities block (chart blocks / HTML preview) that's always
// appended regardless of session state.
func TestBuildQueryInput_AppendSystemPromptOnlyRenderingCapabilities(t *testing.T) {
	app := newStreamApp(stubQueryRunner{})
	empty := ""
	input, _ := app.backend.Query.BuildContextInput(context.Background(), backendquery.ContextBuildParams{
		Prompt:             "hello",
		AppendSystemPrompt: &empty,
	})
	if input.AppendSystemPrompt == nil {
		t.Fatal("expected the static rendering-capabilities block to always be present")
	}
	got := strings.TrimSpace(*input.AppendSystemPrompt)
	if !strings.Contains(got, "Rich rendering available in this UI") {
		t.Errorf("expected the rendering-capabilities block, got %q", got)
	}
	if strings.Contains(got, "Knowledge Base Context") || strings.Contains(got, "user memories") {
		t.Errorf("expected no memories/RAG injection without memories/preferences configured, got %q", got)
	}
}

func TestHandleQueryStream_RuntimeEvents(t *testing.T) {
	runner := &stubStreamingRunner{
		runtimeEvents: []sdk.RuntimeEvent{
			{
				Type:       sdk.RuntimeEventTypeTurnStarted,
				SessionID:  sdk.SessionID("sess-7"),
				TurnID:     "turn-1",
				TurnNumber: 1,
			},
			{
				Type:       sdk.RuntimeEventTypeToolProgress,
				SessionID:  sdk.SessionID("sess-7"),
				TurnID:     "turn-1",
				TurnNumber: 1,
				ToolProgress: &sdk.ToolProgress{
					ToolName:        "bash",
					Stage:           sdk.ToolProgressStageRunning,
					Message:         "calling tool",
					PercentComplete: 66,
				},
			},
			{
				Type:       sdk.RuntimeEventTypeTurnCompleted,
				SessionID:  sdk.SessionID("sess-7"),
				TurnID:     "turn-1",
				TurnNumber: 1,
				StopReason: types.StopReasonEndTurn,
				Usage:      &types.TokenUsage{InputTokens: 10, OutputTokens: 4},
			},
		},
		result: &queryExecutionResult{
			SessionID:  "sess-7",
			Content:    "done",
			StopReason: types.StopReasonEndTurn,
			TurnNumber: 1,
			IsComplete: true,
		},
	}
	app := newStreamApp(runner)
	body, _ := json.Marshal(queryRequest{Prompt: "ping"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/query/stream", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	app.handleQueryStream(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	lines := parseSSELines(rr.Body.String())
	var runtimeLines []sseLine
	for _, line := range lines {
		if line.event == "runtime" {
			runtimeLines = append(runtimeLines, line)
		}
	}
	if len(runtimeLines) != 3 {
		t.Fatalf("expected 3 runtime events, got %d", len(runtimeLines))
	}

	var started sdk.RuntimeEvent
	if err := json.Unmarshal([]byte(runtimeLines[0].data), &started); err != nil {
		t.Fatalf("failed to parse runtime event: %v", err)
	}
	if started.Type != sdk.RuntimeEventTypeTurnStarted {
		t.Fatalf("expected first runtime event turn.started, got %q", started.Type)
	}
	if started.TurnNumber != 1 {
		t.Fatalf("expected turn number 1, got %d", started.TurnNumber)
	}

	var toolProgress sdk.RuntimeEvent
	if err := json.Unmarshal([]byte(runtimeLines[1].data), &toolProgress); err != nil {
		t.Fatalf("failed to parse tool progress runtime event: %v", err)
	}
	if toolProgress.Type != sdk.RuntimeEventTypeToolProgress {
		t.Fatalf("expected tool.progress runtime event, got %q", toolProgress.Type)
	}
	if toolProgress.ToolProgress == nil || toolProgress.ToolProgress.ToolName != "bash" {
		t.Fatalf("expected bash tool progress payload, got %#v", toolProgress.ToolProgress)
	}

	var completed sdk.RuntimeEvent
	if err := json.Unmarshal([]byte(runtimeLines[2].data), &completed); err != nil {
		t.Fatalf("failed to parse completed runtime event: %v", err)
	}
	if completed.Type != sdk.RuntimeEventTypeTurnCompleted {
		t.Fatalf("expected turn.completed runtime event, got %q", completed.Type)
	}
	if completed.Usage == nil || completed.Usage.InputTokens != 10 || completed.Usage.OutputTokens != 4 {
		t.Fatalf("expected usage payload in completed event, got %#v", completed.Usage)
	}
}

type securityTestFixture struct {
	app         *App
	router      http.Handler
	database    *db.DB
	mcpStore    *db.MCPServerStore
	adminID     string
	adminToken  string
	memberToken string
}

func newSecurityTestFixture(t *testing.T) *securityTestFixture {
	t.Helper()

	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "security.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}
	bootstrap, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "secret-password",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	})
	if err != nil {
		t.Fatalf("EnsureBootstrap failed: %v", err)
	}

	memberHash, err := db.HashPassword("member-password")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	member, err := identity.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "member@example.com",
		DisplayName:  "Member",
		PasswordHash: memberHash,
	})
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	if err := identity.AssignRoleToUser(context.Background(), member.ID, "member"); err != nil {
		t.Fatalf("AssignRoleToUser failed: %v", err)
	}
	if err := identity.AddWorkspaceMember(context.Background(), bootstrap.Workspace.ID, member.ID, "member"); err != nil {
		t.Fatalf("AddWorkspaceMember failed: %v", err)
	}

	mcpStore, err := db.NewMCPServerStore(database)
	if err != nil {
		t.Fatalf("NewMCPServerStore failed: %v", err)
	}

	app := newTestAPIApp(identity, stubQueryRunner{})
	app.permBroker = backendquery.NewPermissionBroker()
	app.promptBroker = backendquery.NewPromptBroker()
	app.backend = seshat.NewApp(seshat.Dependencies{
		Identity:       identity,
		QueryRuntime:   stubQueryRunner{},
		Monitoring:     monitoring.NewSystem(nil),
		MCPServerStore: mcpStore,
	})
	router := CreateRouter(APIConfig{}, app)

	return &securityTestFixture{
		app:         app,
		router:      router,
		database:    database,
		mcpStore:    mcpStore,
		adminID:     bootstrap.AdminUser.ID,
		adminToken:  loginForToken(t, router, "admin@example.com", "secret-password"),
		memberToken: loginForToken(t, router, "member@example.com", "member-password"),
	}
}

func TestPermissionDecisionRejectsDifferentUserOrSession(t *testing.T) {
	fx := newSecurityTestFixture(t)
	ch := fx.app.permBroker.Await("tool-1", fx.adminID, "session-a")

	memberReq := httptest.NewRequest(http.MethodPost, "/api/v1/permissions/tool-1", bytes.NewReader([]byte(`{"approved":true,"session_id":"session-a"}`)))
	memberReq.Header.Set("Authorization", "Bearer "+fx.memberToken)
	memberReq.Header.Set("Content-Type", "application/json")
	memberResp := httptest.NewRecorder()
	fx.router.ServeHTTP(memberResp, memberReq)
	if memberResp.Code != http.StatusForbidden {
		t.Fatalf("expected member approval 403, got %d: %s", memberResp.Code, memberResp.Body.String())
	}

	wrongSessionReq := httptest.NewRequest(http.MethodPost, "/api/v1/permissions/tool-1", bytes.NewReader([]byte(`{"approved":true,"session_id":"session-b"}`)))
	wrongSessionReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	wrongSessionReq.Header.Set("Content-Type", "application/json")
	wrongSessionResp := httptest.NewRecorder()
	fx.router.ServeHTTP(wrongSessionResp, wrongSessionReq)
	if wrongSessionResp.Code != http.StatusForbidden {
		t.Fatalf("expected wrong session approval 403, got %d: %s", wrongSessionResp.Code, wrongSessionResp.Body.String())
	}

	okReq := httptest.NewRequest(http.MethodPost, "/api/v1/permissions/tool-1", bytes.NewReader([]byte(`{"approved":true,"session_id":"session-a"}`)))
	okReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	okReq.Header.Set("Content-Type", "application/json")
	okResp := httptest.NewRecorder()
	fx.router.ServeHTTP(okResp, okReq)
	if okResp.Code != http.StatusNoContent {
		t.Fatalf("expected approval 204, got %d: %s", okResp.Code, okResp.Body.String())
	}

	select {
	case decision := <-ch:
		if !decision.Approved {
			t.Fatal("expected permission approval to resolve true")
		}
	default:
		t.Fatal("expected permission broker resolution")
	}
}

// TestPermissionDecisionSyncsPlanStatus covers the plan_id field added to
// POST /permissions/:id: resolving an exit_plan_mode permission with a
// plan_id must also flip the plan document's persisted status, in the same
// request - previously the frontend made a second, independent PATCH
// /plans/:id call for this, which could diverge from the permission
// decision if it failed (see permissions.go's handler comment).
func TestPermissionDecisionSyncsPlanStatus(t *testing.T) {
	fx := newSecurityTestFixture(t)
	planStore, err := db.NewPlanDocumentStore(fx.database)
	if err != nil {
		t.Fatalf("NewPlanDocumentStore failed: %v", err)
	}
	fx.app.backend.Plans = backendplans.NewService(planStore)

	mustCreatePlan := func(id string) {
		t.Helper()
		if _, err := planStore.Create(context.Background(), db.CreatePlanParams{
			ID:        id,
			SessionID: "session-a",
			UserID:    fx.adminID,
			Slug:      "test-plan",
			Filename:  "test-plan.md",
			Content:   "1. Do the thing",
		}); err != nil {
			t.Fatalf("create plan %s: %v", id, err)
		}
	}

	postDecision := func(toolUseID, sessionID, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/permissions/"+toolUseID, bytes.NewReader([]byte(body)))
		req.Header.Set("Authorization", "Bearer "+fx.adminToken)
		req.Header.Set("Content-Type", "application/json")
		resp := httptest.NewRecorder()
		fx.router.ServeHTTP(resp, req)
		return resp
	}

	t.Run("approve validates the plan", func(t *testing.T) {
		mustCreatePlan("plan-approve")
		fx.app.permBroker.Await("tool-approve", fx.adminID, "session-a")

		resp := postDecision("tool-approve", "session-a", `{"approved":true,"session_id":"session-a","plan_id":"plan-approve"}`)
		if resp.Code != http.StatusNoContent {
			t.Fatalf("expected 204, got %d: %s", resp.Code, resp.Body.String())
		}

		doc, err := planStore.Get(context.Background(), "plan-approve")
		if err != nil || doc == nil {
			t.Fatalf("Get plan-approve: %v", err)
		}
		if doc.Status != "validated" {
			t.Fatalf("expected plan status validated, got %q", doc.Status)
		}
	})

	t.Run("deny rejects the plan", func(t *testing.T) {
		mustCreatePlan("plan-deny")
		fx.app.permBroker.Await("tool-deny", fx.adminID, "session-a")

		resp := postDecision("tool-deny", "session-a", `{"approved":false,"session_id":"session-a","plan_id":"plan-deny","reason":"please revise step 1"}`)
		if resp.Code != http.StatusNoContent {
			t.Fatalf("expected 204, got %d: %s", resp.Code, resp.Body.String())
		}

		doc, err := planStore.Get(context.Background(), "plan-deny")
		if err != nil || doc == nil {
			t.Fatalf("Get plan-deny: %v", err)
		}
		if doc.Status != "rejected" {
			t.Fatalf("expected plan status rejected, got %q", doc.Status)
		}
	})

	t.Run("missing plan_id leaves generic permission decisions unaffected", func(t *testing.T) {
		ch := fx.app.permBroker.Await("tool-no-plan", fx.adminID, "session-a")
		resp := postDecision("tool-no-plan", "session-a", `{"approved":true,"session_id":"session-a"}`)
		if resp.Code != http.StatusNoContent {
			t.Fatalf("expected 204, got %d: %s", resp.Code, resp.Body.String())
		}
		select {
		case decision := <-ch:
			if !decision.Approved {
				t.Fatal("expected approval to resolve true")
			}
		default:
			t.Fatal("expected permission broker resolution")
		}
	})
}

func TestPermissionDecisionCarriesDenyReason(t *testing.T) {
	fx := newSecurityTestFixture(t)
	ch := fx.app.permBroker.Await("tool-2", fx.adminID, "session-a")

	req := httptest.NewRequest(http.MethodPost, "/api/v1/permissions/tool-2", bytes.NewReader(
		[]byte(`{"approved":false,"session_id":"session-a","reason":"please use a read-only approach instead"}`),
	))
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusNoContent {
		t.Fatalf("expected denial 204, got %d: %s", resp.Code, resp.Body.String())
	}

	select {
	case decision := <-ch:
		if decision.Approved {
			t.Fatal("expected permission denial to resolve false")
		}
		if decision.Reason != "please use a read-only approach instead" {
			t.Fatalf("expected deny reason to flow through, got %q", decision.Reason)
		}
	default:
		t.Fatal("expected permission broker resolution")
	}
}

func TestPromptResponseRejectsDifferentUserOrSession(t *testing.T) {
	fx := newSecurityTestFixture(t)
	ch := fx.app.promptBroker.Await("prompt-1", fx.adminID, "session-a")

	memberReq := httptest.NewRequest(http.MethodPost, "/api/v1/prompts/prompt-1", bytes.NewReader([]byte(`{"value":"member","session_id":"session-a"}`)))
	memberReq.Header.Set("Authorization", "Bearer "+fx.memberToken)
	memberReq.Header.Set("Content-Type", "application/json")
	memberResp := httptest.NewRecorder()
	fx.router.ServeHTTP(memberResp, memberReq)
	if memberResp.Code != http.StatusForbidden {
		t.Fatalf("expected member prompt response 403, got %d: %s", memberResp.Code, memberResp.Body.String())
	}

	wrongSessionReq := httptest.NewRequest(http.MethodPost, "/api/v1/prompts/prompt-1", bytes.NewReader([]byte(`{"value":"wrong","session_id":"session-b"}`)))
	wrongSessionReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	wrongSessionReq.Header.Set("Content-Type", "application/json")
	wrongSessionResp := httptest.NewRecorder()
	fx.router.ServeHTTP(wrongSessionResp, wrongSessionReq)
	if wrongSessionResp.Code != http.StatusForbidden {
		t.Fatalf("expected wrong session prompt response 403, got %d: %s", wrongSessionResp.Code, wrongSessionResp.Body.String())
	}

	okReq := httptest.NewRequest(http.MethodPost, "/api/v1/prompts/prompt-1", bytes.NewReader([]byte(`{"value":"approved","session_id":"session-a"}`)))
	okReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	okReq.Header.Set("Content-Type", "application/json")
	okResp := httptest.NewRecorder()
	fx.router.ServeHTTP(okResp, okReq)
	if okResp.Code != http.StatusNoContent {
		t.Fatalf("expected prompt response 204, got %d: %s", okResp.Code, okResp.Body.String())
	}

	select {
	case response := <-ch:
		if response.Value != "approved" {
			t.Fatalf("expected prompt value %q, got %#v", "approved", response.Value)
		}
	default:
		t.Fatal("expected prompt broker resolution")
	}
}

func TestMCPConfigRequiresAdminAndRedactsSecrets(t *testing.T) {
	fx := newSecurityTestFixture(t)
	fx.app.connectedServerURL = "https://seshat-server.test"
	fx.router = CreateRouter(APIConfig{}, fx.app)
	_, err := fx.mcpStore.Create(context.Background(), db.CreateMCPServerParams{
		Name:       "secure-server",
		ServerType: "http",
		URL:        "https://example.com/mcp",
		Env: map[string]string{
			"API_KEY": "super-secret",
			"PLAIN":   "visible",
		},
		Headers: map[string]string{
			"Authorization": "Bearer secret-token",
			"X-Trace":       "trace-1",
		},
		Enabled: true,
	})
	if err != nil {
		t.Fatalf("Create mcp server failed: %v", err)
	}

	memberReq := httptest.NewRequest(http.MethodGet, "/api/v1/mcp/config", nil)
	memberReq.Header.Set("Authorization", "Bearer "+fx.memberToken)
	memberResp := httptest.NewRecorder()
	fx.router.ServeHTTP(memberResp, memberReq)
	if memberResp.Code != http.StatusForbidden {
		t.Fatalf("expected member MCP config access 403, got %d: %s", memberResp.Code, memberResp.Body.String())
	}

	adminReq := httptest.NewRequest(http.MethodGet, "/api/v1/mcp/config", nil)
	adminReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	adminResp := httptest.NewRecorder()
	fx.router.ServeHTTP(adminResp, adminReq)
	if adminResp.Code != http.StatusOK {
		t.Fatalf("expected admin MCP config access 200, got %d: %s", adminResp.Code, adminResp.Body.String())
	}

	var payload struct {
		Servers []mcpServerResponse `json:"servers"`
	}
	if err := json.Unmarshal(adminResp.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode MCP config response: %v", err)
	}
	if len(payload.Servers) != 1 {
		t.Fatalf("expected 1 MCP server, got %d", len(payload.Servers))
	}
	server := payload.Servers[0]
	if server.Env["API_KEY"] != redactedSecretValue {
		t.Fatalf("expected API_KEY to be redacted, got %q", server.Env["API_KEY"])
	}
	if server.Env["PLAIN"] != "visible" {
		t.Fatalf("expected non-secret env to remain visible, got %q", server.Env["PLAIN"])
	}
	if server.Headers["Authorization"] != redactedSecretValue {
		t.Fatalf("expected Authorization header to be redacted, got %q", server.Headers["Authorization"])
	}
	if server.Headers["X-Trace"] != "trace-1" {
		t.Fatalf("expected non-secret header to remain visible, got %q", server.Headers["X-Trace"])
	}
}

func TestMCPConfigUpdatePreservesRedactedSecrets(t *testing.T) {
	fx := newSecurityTestFixture(t)
	server, err := fx.mcpStore.Create(context.Background(), db.CreateMCPServerParams{
		Name:       "update-server",
		ServerType: "http",
		URL:        "https://example.com/mcp",
		Env: map[string]string{
			"API_KEY": "super-secret",
			"PLAIN":   "visible",
		},
		Headers: map[string]string{
			"Authorization": "Bearer secret-token",
			"X-Trace":       "trace-1",
		},
		Enabled: true,
	})
	if err != nil {
		t.Fatalf("Create mcp server failed: %v", err)
	}

	body, _ := json.Marshal(map[string]any{
		"env": map[string]string{
			"API_KEY": redactedSecretValue,
			"PLAIN":   "updated",
		},
		"headers": map[string]string{
			"Authorization": redactedSecretValue,
			"X-Trace":       "trace-2",
		},
	})
	updateReq := httptest.NewRequest(http.MethodPut, "/api/v1/mcp/config/"+server.ID, bytes.NewReader(body))
	updateReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp := httptest.NewRecorder()
	fx.router.ServeHTTP(updateResp, updateReq)
	if updateResp.Code != http.StatusOK {
		t.Fatalf("expected MCP update 200, got %d: %s", updateResp.Code, updateResp.Body.String())
	}

	updated, err := fx.mcpStore.GetByID(context.Background(), server.ID)
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}
	if updated.Env["API_KEY"] != "super-secret" {
		t.Fatalf("expected API_KEY secret to be preserved, got %q", updated.Env["API_KEY"])
	}
	if updated.Env["PLAIN"] != "updated" {
		t.Fatalf("expected non-secret env update, got %q", updated.Env["PLAIN"])
	}
	if updated.Headers["Authorization"] != "Bearer secret-token" {
		t.Fatalf("expected Authorization secret to be preserved, got %q", updated.Headers["Authorization"])
	}
	if updated.Headers["X-Trace"] != "trace-2" {
		t.Fatalf("expected non-secret header update, got %q", updated.Headers["X-Trace"])
	}
}

var stubSessionCounter uint64

// stubSessionManager is a minimal in-memory session manager for tests.
type stubSessionManager struct {
	sessions   map[string]bool
	closeCount int32
}

func newStubSessionManager() *stubSessionManager {
	return &stubSessionManager{sessions: make(map[string]bool)}
}

func (m *stubSessionManager) ListSessions() ([]*sdk.SessionInfo, error) {
	return []*sdk.SessionInfo{}, nil
}

func (m *stubSessionManager) CreateSession(_ context.Context) (backendquery.SessionHandle, error) {
	n := atomic.AddUint64(&stubSessionCounter, 1)
	id := sdk.SessionID(fmt.Sprintf("sess_stub_%d", n))
	m.sessions[id.String()] = true
	return &stubSessionHandle{id: id, onClose: func() {
		atomic.AddInt32(&m.closeCount, 1)
	}}, nil
}

func (m *stubSessionManager) DeleteSession(id sdk.SessionID) error {
	delete(m.sessions, id.String())
	return nil
}

type stubSessionHandle struct {
	id      sdk.SessionID
	onClose func()
}

func (h *stubSessionHandle) GetID() sdk.SessionID { return h.id }
func (h *stubSessionHandle) Close() error {
	if h.onClose != nil {
		h.onClose()
	}
	return nil
}

func newSessionTestApp(t *testing.T, database *db.DB, ownershipStore *db.SessionOwnershipStore) (*App, *stubSessionManager) {
	t.Helper()
	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	mgr := newStubSessionManager()
	app := &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity:         store,
			QueryRuntime:     stubQueryRunner{},
			SessionManager:   mgr,
			SessionOwnership: ownershipStore,
		}),
	}
	return app, mgr
}

func bootstrapAndLogin(t *testing.T, router http.Handler, store *db.IdentityStore, email, password string) string {
	t.Helper()
	return loginForToken(t, router, email, password)
}

// TestSessionOwnership_UserScopedList verifies that two users only see their own sessions.
func TestSessionOwnership_UserScopedList(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "sessions.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer database.Close()

	ownershipStore, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}

	identityStore, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	_, err = identityStore.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Main",
		DefaultWorkspaceSlug: "main",
	})
	if err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	memberHash, err := db.HashPassword("memberpass")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	member, err := identityStore.CreateUser(context.Background(), db.CreateUserParams{
		Email: "member@example.com", DisplayName: "Member", PasswordHash: memberHash,
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if err := identityStore.AssignRoleToUser(context.Background(), member.ID, "member"); err != nil {
		t.Fatalf("AssignRoleToUser: %v", err)
	}

	app, _ := newSessionTestApp(t, database, ownershipStore)
	router := CreateRouter(APIConfig{}, app)

	adminToken := loginForToken(t, router, "admin@example.com", "adminpass")
	memberToken := loginForToken(t, router, "member@example.com", "memberpass")

	// Admin creates a session
	adminCreateResp := doRequest(t, router, http.MethodPost, "/api/v1/sessions", nil, adminToken)
	if adminCreateResp.Code != http.StatusCreated {
		t.Fatalf("admin create session: expected 201, got %d: %s", adminCreateResp.Code, adminCreateResp.Body.String())
	}
	var adminSession map[string]any
	json.Unmarshal(adminCreateResp.Body.Bytes(), &adminSession)
	adminSessionID, _ := adminSession["session_id"].(string)
	if adminSessionID == "" {
		t.Fatalf("expected session_id in response, got: %s", adminCreateResp.Body.String())
	}

	// Member creates a session
	memberCreateResp := doRequest(t, router, http.MethodPost, "/api/v1/sessions", nil, memberToken)
	if memberCreateResp.Code != http.StatusCreated {
		t.Fatalf("member create session: expected 201, got %d: %s", memberCreateResp.Code, memberCreateResp.Body.String())
	}
	var memberSession map[string]any
	json.Unmarshal(memberCreateResp.Body.Bytes(), &memberSession)
	memberSessionID, _ := memberSession["session_id"].(string)
	if memberSessionID == "" {
		t.Fatalf("expected session_id in response, got: %s", memberCreateResp.Body.String())
	}

	// Member lists sessions — must see only their own
	memberListResp := doRequest(t, router, http.MethodGet, "/api/v1/sessions", nil, memberToken)
	if memberListResp.Code != http.StatusOK {
		t.Fatalf("member list sessions: expected 200, got %d: %s", memberListResp.Code, memberListResp.Body.String())
	}
	var memberList map[string]any
	json.Unmarshal(memberListResp.Body.Bytes(), &memberList)
	memberCount := int(memberList["count"].(float64))
	if memberCount != 1 {
		t.Fatalf("expected member to see 1 session, got %d: %s", memberCount, memberListResp.Body.String())
	}
	sessions := memberList["sessions"].([]any)
	sess := sessions[0].(map[string]any)
	if sess["session_id"] != memberSessionID {
		t.Fatalf("expected member session_id %q, got %q", memberSessionID, sess["session_id"])
	}
	if sess["session_id"] == adminSessionID {
		t.Fatal("member must not see admin session")
	}

	// Admin lists sessions - sees only their own.
	adminListResp := doRequest(t, router, http.MethodGet, "/api/v1/sessions", nil, adminToken)
	if adminListResp.Code != http.StatusOK {
		t.Fatalf("admin list sessions: expected 200, got %d: %s", adminListResp.Code, adminListResp.Body.String())
	}
	var adminList map[string]any
	json.Unmarshal(adminListResp.Body.Bytes(), &adminList)
	adminCount := int(adminList["count"].(float64))
	if adminCount != 1 {
		t.Fatalf("expected admin to see 1 session, got %d: %s", adminCount, adminListResp.Body.String())
	}
	adminSessions := adminList["sessions"].([]any)
	adminSess := adminSessions[0].(map[string]any)
	if adminSess["session_id"] != adminSessionID {
		t.Fatalf("expected admin session_id %q, got %q", adminSessionID, adminSess["session_id"])
	}
	if adminSess["session_id"] == memberSessionID {
		t.Fatal("admin must not see member session")
	}
}

// TestSessionFilesCrossUserAccess verifies that GET /api/v1/sessions/{id}/files
// enforces session ownership the same way the POST (upload) side already does —
// regression test for the IDOR where the GET branch listed any session's files
// for any authenticated caller, without checking who the session belongs to.
func TestSessionFilesCrossUserAccess(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "session-files.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer database.Close()

	ownershipStore, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}
	identityStore, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	fileStore, err := db.NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	if _, err := identityStore.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@sessionfiles.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Main",
		DefaultWorkspaceSlug: "main",
	}); err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}
	otherHash, err := db.HashPassword("otherpass")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	other, err := identityStore.CreateUser(context.Background(), db.CreateUserParams{
		Email: "other@sessionfiles.test", DisplayName: "Other", PasswordHash: otherHash,
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if err := identityStore.AssignRoleToUser(context.Background(), other.ID, "member"); err != nil {
		t.Fatalf("AssignRoleToUser: %v", err)
	}

	mgr := newStubSessionManager()
	app := &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity:         identityStore,
			QueryRuntime:     stubQueryRunner{},
			SessionManager:   mgr,
			SessionOwnership: ownershipStore,
			FileStore:        fileStore,
			ArtifactStore:    newStubArtifactStore(),
		}),
	}
	router := CreateRouter(APIConfig{}, app)

	adminToken := loginForToken(t, router, "admin@sessionfiles.test", "adminpass")
	otherToken := loginForToken(t, router, "other@sessionfiles.test", "otherpass")

	// Admin creates a session.
	createResp := doRequest(t, router, http.MethodPost, "/api/v1/sessions", nil, adminToken)
	if createResp.Code != http.StatusCreated {
		t.Fatalf("create session: expected 201, got %d: %s", createResp.Code, createResp.Body.String())
	}
	var created map[string]any
	json.Unmarshal(createResp.Body.Bytes(), &created)
	sessionID, _ := created["session_id"].(string)
	if sessionID == "" {
		t.Fatalf("expected session_id in response, got: %s", createResp.Body.String())
	}

	// Seed a file record on that session directly against the store, bypassing
	// the multipart upload path (irrelevant to what's under test here).
	if _, err := fileStore.Create(context.Background(), db.CreateFileParams{
		UserID:      other.ID, // deliberately not the session owner; only SessionID gates this endpoint
		SessionID:   sessionID,
		Filename:    "secret.txt",
		ContentType: "text/plain",
		Size:        4,
		StorageKey:  "sessionfiles-test-key",
	}); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	// Owner lists their session's files — OK.
	ownerResp := doRequest(t, router, http.MethodGet, "/api/v1/sessions/"+sessionID+"/files", nil, adminToken)
	if ownerResp.Code != http.StatusOK {
		t.Fatalf("owner list session files: expected 200, got %d: %s", ownerResp.Code, ownerResp.Body.String())
	}
	var ownerList map[string]any
	json.Unmarshal(ownerResp.Body.Bytes(), &ownerList)
	if count, _ := ownerList["count"].(float64); count != 1 {
		t.Fatalf("expected owner to see 1 file, got %v: %s", ownerList["count"], ownerResp.Body.String())
	}

	// A different, non-admin user must not be able to list another user's
	// session files — this is the IDOR the fix closes.
	otherResp := doRequest(t, router, http.MethodGet, "/api/v1/sessions/"+sessionID+"/files", nil, otherToken)
	if otherResp.Code != http.StatusForbidden {
		t.Fatalf("cross-user session files list: expected 403, got %d: %s", otherResp.Code, otherResp.Body.String())
	}
}

// TestSessionOwnership_DeleteEnforcement verifies cross-user delete is forbidden.
func TestSessionOwnership_DeleteEnforcement(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "sessions-del.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer database.Close()

	ownershipStore, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}
	identityStore, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	_, err = identityStore.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Main",
		DefaultWorkspaceSlug: "main",
	})
	if err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	memberHash, _ := db.HashPassword("memberpass")
	member, _ := identityStore.CreateUser(context.Background(), db.CreateUserParams{
		Email: "member@example.com", DisplayName: "Member", PasswordHash: memberHash,
	})
	_ = identityStore.AssignRoleToUser(context.Background(), member.ID, "member")

	app, _ := newSessionTestApp(t, database, ownershipStore)
	router := CreateRouter(APIConfig{}, app)

	adminToken := loginForToken(t, router, "admin@example.com", "adminpass")
	memberToken := loginForToken(t, router, "member@example.com", "memberpass")

	// Admin creates a session
	adminCreateResp := doRequest(t, router, http.MethodPost, "/api/v1/sessions", nil, adminToken)
	if adminCreateResp.Code != http.StatusCreated {
		t.Fatalf("admin create session: expected 201, got %d", adminCreateResp.Code)
	}
	var adminSession map[string]any
	json.Unmarshal(adminCreateResp.Body.Bytes(), &adminSession)
	adminSessionID, _ := adminSession["session_id"].(string)

	// Member tries to delete admin's session → must get 403
	memberDeleteResp := doRequest(t, router, http.MethodDelete, "/api/v1/sessions/"+adminSessionID, nil, memberToken)
	if memberDeleteResp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when member deletes admin session, got %d: %s", memberDeleteResp.Code, memberDeleteResp.Body.String())
	}

	// Admin can delete their own session
	adminDeleteResp := doRequest(t, router, http.MethodDelete, "/api/v1/sessions/"+adminSessionID, nil, adminToken)
	if adminDeleteResp.Code != http.StatusNoContent {
		t.Fatalf("expected 204 when admin deletes own session, got %d: %s", adminDeleteResp.Code, adminDeleteResp.Body.String())
	}

	// After deletion, the session no longer appears in admin's list
	adminListResp := doRequest(t, router, http.MethodGet, "/api/v1/sessions", nil, adminToken)
	if adminListResp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", adminListResp.Code)
	}
	var adminList map[string]any
	json.Unmarshal(adminListResp.Body.Bytes(), &adminList)
	if count := int(adminList["count"].(float64)); count != 0 {
		t.Fatalf("expected 0 sessions after deletion, got %d", count)
	}
}

// TestSessionOwnership_AdminCannotOverride verifies conversations remain
// owner-scoped even when the caller has an admin role.
func TestSessionOwnership_AdminCannotOverride(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "sessions-admin.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer database.Close()

	ownershipStore, _ := db.NewSessionOwnershipStore(database)
	identityStore, _ := db.NewIdentityStore(database)
	_, _ = identityStore.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Main",
		DefaultWorkspaceSlug: "main",
	})

	memberHash, _ := db.HashPassword("memberpass")
	member, _ := identityStore.CreateUser(context.Background(), db.CreateUserParams{
		Email: "member@example.com", DisplayName: "Member", PasswordHash: memberHash,
	})
	_ = identityStore.AssignRoleToUser(context.Background(), member.ID, "member")

	app, _ := newSessionTestApp(t, database, ownershipStore)
	router := CreateRouter(APIConfig{}, app)

	adminToken := loginForToken(t, router, "admin@example.com", "adminpass")
	memberToken := loginForToken(t, router, "member@example.com", "memberpass")

	// Member creates a session
	memberCreateResp := doRequest(t, router, http.MethodPost, "/api/v1/sessions", nil, memberToken)
	if memberCreateResp.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", memberCreateResp.Code)
	}
	var memberSession map[string]any
	json.Unmarshal(memberCreateResp.Body.Bytes(), &memberSession)
	memberSessionID, _ := memberSession["session_id"].(string)

	// Admin cannot delete the member's session.
	adminDeleteResp := doRequest(t, router, http.MethodDelete, "/api/v1/sessions/"+memberSessionID, nil, adminToken)
	if adminDeleteResp.Code != http.StatusForbidden {
		t.Fatalf("expected admin delete of member session to be forbidden, got %d: %s", adminDeleteResp.Code, adminDeleteResp.Body.String())
	}
}

func TestCreateSessionDoesNotCloseRuntimeSession(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "sessions-open.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer database.Close()

	ownershipStore, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}
	identityStore, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	_, err = identityStore.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Main",
		DefaultWorkspaceSlug: "main",
	})
	if err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	app, mgr := newSessionTestApp(t, database, ownershipStore)
	router := CreateRouter(APIConfig{}, app)
	adminToken := loginForToken(t, router, "admin@example.com", "adminpass")

	resp := doRequest(t, router, http.MethodPost, "/api/v1/sessions", nil, adminToken)
	if resp.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", resp.Code, resp.Body.String())
	}
	if got := atomic.LoadInt32(&mgr.closeCount); got != 0 {
		t.Fatalf("expected created runtime session to stay open, close count=%d", got)
	}
}

func TestSessionOwnership_UpdateTitle(t *testing.T) {
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "sessions-title.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer database.Close()

	ownershipStore, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}
	identityStore, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	_, err = identityStore.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@example.com",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Main",
		DefaultWorkspaceSlug: "main",
	})
	if err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	app, _ := newSessionTestApp(t, database, ownershipStore)
	router := CreateRouter(APIConfig{}, app)
	adminToken := loginForToken(t, router, "admin@example.com", "adminpass")

	createResp := doRequest(t, router, http.MethodPost, "/api/v1/sessions", nil, adminToken)
	if createResp.Code != http.StatusCreated {
		t.Fatalf("create session: expected 201, got %d: %s", createResp.Code, createResp.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(createResp.Body.Bytes(), &created)
	sessionID, _ := created["session_id"].(string)
	if sessionID == "" {
		t.Fatalf("expected session_id in response, got %s", createResp.Body.String())
	}

	body, _ := json.Marshal(map[string]string{"title": "Audit Seshat"})
	updateResp := doRequest(t, router, http.MethodPatch, "/api/v1/sessions/"+sessionID, body, adminToken)
	if updateResp.Code != http.StatusNoContent {
		t.Fatalf("update title: expected 204, got %d: %s", updateResp.Code, updateResp.Body.String())
	}

	listResp := doRequest(t, router, http.MethodGet, "/api/v1/sessions", nil, adminToken)
	if listResp.Code != http.StatusOK {
		t.Fatalf("list sessions: expected 200, got %d: %s", listResp.Code, listResp.Body.String())
	}
	var listed map[string]any
	_ = json.Unmarshal(listResp.Body.Bytes(), &listed)
	sessions := listed["sessions"].([]any)
	if len(sessions) != 1 {
		t.Fatalf("expected one session, got %d", len(sessions))
	}
	session := sessions[0].(map[string]any)
	if got := session["title"]; got != "Audit Seshat" {
		t.Fatalf("expected updated title, got %#v", got)
	}
}

func doRequest(t *testing.T, router http.Handler, method, path string, body []byte, token string) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body != nil {
		req = httptest.NewRequest(method, path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	return rr
}

// ─── Helper ───────────────────────────────────────────────────────────────────

type fakeOAuthClientFactory struct {
	clients map[string]*fakeOAuthClient
}

func (f fakeOAuthClientFactory) NewClient(provider string) (bksettings.OAuthClient, error) {
	client, ok := f.clients[provider]
	if !ok {
		return nil, fmt.Errorf("unsupported oauth provider %s", provider)
	}
	return client, nil
}

type fakeOAuthClient struct {
	deviceCodeResp *bksettings.OAuthDeviceCodeResponse
	exchangeQueue  []fakeOAuthExchangeResult
	refreshResp    *bksettings.OAuthTokenResponse
	refreshErr     error
}

type fakeOAuthExchangeResult struct {
	token *bksettings.OAuthTokenResponse
	err   error
}

func (f *fakeOAuthClient) DeviceCode(ctx context.Context) (*bksettings.OAuthDeviceCodeResponse, error) {
	return f.deviceCodeResp, nil
}

func (f *fakeOAuthClient) ExchangeDeviceToken(ctx context.Context, deviceCode string, userCode string) (*bksettings.OAuthTokenResponse, error) {
	if len(f.exchangeQueue) == 0 {
		return nil, fmt.Errorf("no exchange result queued")
	}
	result := f.exchangeQueue[0]
	f.exchangeQueue = f.exchangeQueue[1:]
	return result.token, result.err
}

func (f *fakeOAuthClient) RefreshToken(ctx context.Context, refreshToken string) (*bksettings.OAuthTokenResponse, error) {
	return f.refreshResp, f.refreshErr
}

func newSettingsTestApp(t *testing.T, oauthFactory bksettings.OAuthClientFactory) (*App, *db.IdentityStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "settings-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	settingStore, err := db.NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	oauthStore, err := db.NewProviderOAuthConnectionStore(database)
	if err != nil {
		t.Fatalf("NewProviderOAuthConnectionStore: %v", err)
	}
	modelStore, err := db.NewProviderModelStore(database)
	if err != nil {
		t.Fatalf("NewProviderModelStore: %v", err)
	}

	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@settings.test",
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
			Identity:     identity,
			SettingStore: settingStore,
			OAuthStore:   oauthStore,
			OAuthClients: oauthFactory,
		}),
		modelStore: modelStore,
	}
	return app, identity
}

// ─── Tests ────────────────────────────────────────────────────────────────────

func TestSettingCreateAndList(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")

	// Create a setting.
	body, _ := json.Marshal(map[string]string{
		"provider": "openai",
		"name":     "My OpenAI",
		"base_url": "https://api.openai.com/v1",
		"model_id": "gpt-4o",
		"api_key":  "sk-test-secret",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create setting: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	json.NewDecoder(rec.Body).Decode(&created)
	id, _ := created["id"].(string)
	if id == "" {
		t.Fatal("expected non-empty setting id")
	}
	// API key must not be exposed in the response.
	if _, exposed := created["api_key"]; exposed {
		t.Error("api_key must not appear in create response")
	}
	if created["has_api_key"] != true {
		t.Errorf("expected has_api_key=true, got %v", created["has_api_key"])
	}

	// List settings.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list settings: got %d", rec.Code)
	}
	var list map[string]any
	json.NewDecoder(rec.Body).Decode(&list)
	if int(list["count"].(float64)) != 1 {
		t.Errorf("expected 1 setting, got %v", list["count"])
	}
}

func TestSettingGetAndDelete(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")

	// Create.
	body, _ := json.Marshal(map[string]string{"provider": "anthropic", "name": "Claude", "api_key": "sk-ant-test"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var created map[string]any
	json.NewDecoder(rec.Body).Decode(&created)
	id := created["id"].(string)

	// Get.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get setting: got %d", rec.Code)
	}
	var got map[string]any
	json.NewDecoder(rec.Body).Decode(&got)
	if got["provider"] != "anthropic" {
		t.Errorf("expected provider=anthropic, got %v", got["provider"])
	}
	if _, exposed := got["api_key"]; exposed {
		t.Error("api_key must not be exposed in GET response")
	}

	// Delete.
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/settings/providers/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete setting: got %d, body=%s", rec.Code, rec.Body.String())
	}

	// Get after delete → 404.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get deleted: expected 404, got %d", rec.Code)
	}
}

func TestSettingUpdate(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")

	// Create without API key.
	createBody, _ := json.Marshal(map[string]string{
		"provider": "ollama",
		"name":     "Local Ollama",
		"base_url": "http://localhost:11434",
		"model_id": "llama3",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var created map[string]any
	json.NewDecoder(rec.Body).Decode(&created)
	id := created["id"].(string)
	if created["has_api_key"] != false {
		t.Errorf("expected has_api_key=false on creation without key")
	}

	// Update: change name and set API key.
	newName := "Ollama Updated"
	newKey := "some-api-key"
	updateBody, _ := json.Marshal(map[string]any{
		"name":    newName,
		"api_key": newKey,
	})
	req = httptest.NewRequest(http.MethodPut, "/api/v1/settings/providers/"+id, bytes.NewReader(updateBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update setting: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var updated map[string]any
	json.NewDecoder(rec.Body).Decode(&updated)
	if updated["name"] != newName {
		t.Errorf("expected name=%q, got %v", newName, updated["name"])
	}
	if updated["has_api_key"] != true {
		t.Errorf("expected has_api_key=true after update, got %v", updated["has_api_key"])
	}
	// base_url and model_id must be unchanged.
	if updated["base_url"] != "http://localhost:11434" {
		t.Errorf("base_url changed unexpectedly: %v", updated["base_url"])
	}

	// Clear the API key via PUT with api_key = "".
	clearBody, _ := json.Marshal(map[string]any{"api_key": ""})
	req = httptest.NewRequest(http.MethodPut, "/api/v1/settings/providers/"+id, bytes.NewReader(clearBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("clear api_key: got %d", rec.Code)
	}
	var cleared map[string]any
	json.NewDecoder(rec.Body).Decode(&cleared)
	if cleared["has_api_key"] != false {
		t.Errorf("expected has_api_key=false after clear, got %v", cleared["has_api_key"])
	}
}

func TestSettingCrossUserAccess(t *testing.T) {
	app, identity := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	adminToken := loginAs(t, router, "admin@settings.test", "adminpass")

	// Create a second user.
	bobHash, err := db.HashPassword("bobpass")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := identity.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "bob@settings.test",
		PasswordHash: bobHash,
		DisplayName:  "Bob",
	}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	bobToken := loginAs(t, router, "bob@settings.test", "bobpass")

	// Bob creates his own personal setting first; admin must not see it through
	// the normal personal settings endpoint.
	bobBody, _ := json.Marshal(map[string]string{"provider": "mistral", "name": "Bob's Key"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(bobBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("bob create setting: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var bobCreated map[string]any
	json.NewDecoder(rec.Body).Decode(&bobCreated)
	bobSettingID := bobCreated["id"].(string)

	// Admin creates a setting.
	body, _ := json.Marshal(map[string]string{"provider": "openai", "name": "Admin's Key"})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var created map[string]any
	json.NewDecoder(rec.Body).Decode(&created)
	id := created["id"].(string)

	// Bob cannot GET admin's setting → 403.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("cross-user GET: expected 403, got %d", rec.Code)
	}

	// Bob cannot DELETE admin's setting → 403.
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/settings/providers/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("cross-user DELETE: expected 403, got %d", rec.Code)
	}

	// Bob's own list only contains Bob's personal setting.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers", nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var list map[string]any
	json.NewDecoder(rec.Body).Decode(&list)
	if int(list["count"].(float64)) != 1 {
		t.Errorf("bob's list should only contain bob's own setting, got %v", list["count"])
	}

	// Admin's normal settings endpoint is also personal-only; it must not leak
	// Bob's local provider into the admin account.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	json.NewDecoder(rec.Body).Decode(&list)
	if int(list["count"].(float64)) != 1 {
		t.Errorf("admin list should only see admin's own setting, got %v", list["count"])
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/"+bobSettingID, nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("admin cross-user GET should be forbidden: got %d", rec.Code)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/v1/settings/providers/"+bobSettingID, nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("admin cross-user DELETE should be forbidden: got %d", rec.Code)
	}
}

func TestSettingValidation(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")

	// Missing provider → 422.
	body, _ := json.Marshal(map[string]string{"name": "No Provider"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing provider: expected 422, got %d", rec.Code)
	}

	// Missing name → 422.
	body, _ = json.Marshal(map[string]string{"provider": "openai"})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing name: expected 422, got %d", rec.Code)
	}
}

func TestSettingOAuthLifecycle(t *testing.T) {
	oauthFactory := fakeOAuthClientFactory{
		clients: map[string]*fakeOAuthClient{
			"openai": {
				deviceCodeResp: &bksettings.OAuthDeviceCodeResponse{
					DeviceCode:      "device-code-1",
					UserCode:        "ABCD-EFGH",
					VerificationURL: "https://example.test/verify",
					ExpiresIn:       600,
					Interval:        5,
				},
				exchangeQueue: []fakeOAuthExchangeResult{
					{err: fmt.Errorf("authorization_pending")},
					{token: &bksettings.OAuthTokenResponse{
						AccessToken:  "access-token-1",
						RefreshToken: "refresh-token-1",
						IDToken:      "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidXNlckBleGFtcGxlLnRlc3QifQ.",
						Scope:        "openid profile email offline_access",
						ExpiresIn:    3600,
					}},
				},
			},
		},
	}
	app, _ := newSettingsTestApp(t, oauthFactory)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")

	createBody, _ := json.Marshal(map[string]string{
		"provider":  "openai",
		"name":      "ChatGPT Account",
		"auth_kind": "oauth",
		"model_id":  "gpt-4o",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create oauth setting: got %d body=%s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	json.NewDecoder(rec.Body).Decode(&created)
	id := created["id"].(string)
	if created["auth_kind"] != "oauth" {
		t.Fatalf("expected auth_kind=oauth, got %v", created["auth_kind"])
	}
	if created["connection_status"] != "not_connected" {
		t.Fatalf("expected not_connected, got %v", created["connection_status"])
	}

	req = httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers/"+id+"/oauth/start", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("start oauth: got %d body=%s", rec.Code, rec.Body.String())
	}
	var challenge map[string]any
	json.NewDecoder(rec.Body).Decode(&challenge)
	if challenge["status"] != "pending" {
		t.Fatalf("expected pending challenge, got %v", challenge["status"])
	}
	if challenge["user_code"] != "ABCD-EFGH" {
		t.Fatalf("unexpected user_code: %v", challenge["user_code"])
	}

	req = httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers/"+id+"/oauth/poll", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("first poll oauth: got %d body=%s", rec.Code, rec.Body.String())
	}
	var pending map[string]any
	json.NewDecoder(rec.Body).Decode(&pending)
	if pending["connection_status"] != "pending" {
		t.Fatalf("expected pending after first poll, got %v", pending["connection_status"])
	}

	req = httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers/"+id+"/oauth/poll", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("second poll oauth: got %d body=%s", rec.Code, rec.Body.String())
	}
	var connected map[string]any
	json.NewDecoder(rec.Body).Decode(&connected)
	if connected["connection_status"] != "connected" {
		t.Fatalf("expected connected after second poll, got %v", connected["connection_status"])
	}
	if connected["oauth_account_email"] != "user@example.test" {
		t.Fatalf("unexpected oauth_account_email: %v", connected["oauth_account_email"])
	}
	if connected["oauth_subject"] != "user-123" {
		t.Fatalf("unexpected oauth_subject: %v", connected["oauth_subject"])
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/v1/settings/providers/"+id+"/oauth", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("disconnect oauth: got %d body=%s", rec.Code, rec.Body.String())
	}
	var disconnected map[string]any
	json.NewDecoder(rec.Body).Decode(&disconnected)
	if disconnected["connection_status"] != "not_connected" {
		t.Fatalf("expected not_connected after disconnect, got %v", disconnected["connection_status"])
	}
}

func newSkillsTestApp(t *testing.T) (*App, *db.IdentityStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "skills-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@skills.test",
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
			Identity: identity,
		}),
	}
	return app, identity
}

func createSkillForTest(t *testing.T, router http.Handler, token, name, content string) {
	t.Helper()
	body, _ := json.Marshal(map[string]any{
		"name":         name,
		"display_name": name,
		"description":  "test skill",
		"content":      content,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/skills", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create skill: got %d, body=%s", rec.Code, rec.Body.String())
	}
}

// updateSkill sends a PUT to /api/v1/skills/{name} with the given body.
func updateSkill(t *testing.T, router http.Handler, token, name string, body map[string]any) int {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/skills/"+name, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec.Code
}

// listSkills returns the skills DTO slice from GET /api/v1/skills.
func listSkills(t *testing.T, router http.Handler, token string) []map[string]any {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/skills", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list skills: got %d body=%s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Skills []map[string]any `json:"skills"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode skills list: %v", err)
	}
	return resp.Skills
}

func readSkillFile(t *testing.T, principalUserID, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(publicskills.UserPath(principalUserID), name, "skill.md"))
	if err != nil {
		t.Fatalf("read skill file: %v", err)
	}
	return string(data)
}

func TestSkillEnableDisable(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())

	app, _ := newSkillsTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@skills.test", "adminpass")

	createSkillForTest(t, router, token, "my-skill", "Do something useful")
	principal, err := app.backend.Auth.ResolvePrincipal(context.Background(), token)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}

	// Skill should be enabled by default.
	skills := listSkills(t, router, token)
	var found map[string]any
	for _, s := range skills {
		if s["name"] == "my-skill" {
			found = s
			break
		}
	}
	if found == nil {
		t.Fatal("skill not found in list after creation")
	}
	if enabled, _ := found["enabled"].(bool); !enabled {
		t.Fatalf("expected enabled=true after creation, got %v", found["enabled"])
	}

	// Disable the skill and ensure content/frontmatter are preserved.
	disabled := false
	if code := updateSkill(t, router, token, "my-skill", map[string]any{"enabled": disabled}); code != http.StatusOK {
		t.Fatalf("disable skill: got %d", code)
	}
	updatedContent := readSkillFile(t, principal.User.ID, "my-skill")
	if !strings.Contains(updatedContent, "name: \"my-skill\"") || !strings.Contains(updatedContent, "description: \"test skill\"") {
		t.Fatalf("toggle-only update must preserve frontmatter, got:\n%s", updatedContent)
	}
	if !strings.Contains(updatedContent, "Do something useful") {
		t.Fatalf("toggle-only update must preserve markdown body, got:\n%s", updatedContent)
	}

	// List should reflect enabled=false.
	skills = listSkills(t, router, token)
	for _, s := range skills {
		if s["name"] == "my-skill" {
			found = s
			break
		}
	}
	if enabled, _ := found["enabled"].(bool); enabled {
		t.Fatalf("expected enabled=false after disable, got %v", found["enabled"])
	}

	// Update content WITHOUT sending enabled — disabled state must be preserved.
	if code := updateSkill(t, router, token, "my-skill", map[string]any{"description": "updated desc"}); code != http.StatusOK {
		t.Fatalf("content update: got %d", code)
	}
	skills = listSkills(t, router, token)
	for _, s := range skills {
		if s["name"] == "my-skill" {
			found = s
			break
		}
	}
	if enabled, _ := found["enabled"].(bool); enabled {
		t.Fatalf("content-only PUT must not re-enable the skill, got enabled=%v", found["enabled"])
	}

	// Re-enable explicitly.
	if code := updateSkill(t, router, token, "my-skill", map[string]any{"enabled": true}); code != http.StatusOK {
		t.Fatalf("re-enable skill: got %d", code)
	}
	skills = listSkills(t, router, token)
	for _, s := range skills {
		if s["name"] == "my-skill" {
			found = s
			break
		}
	}
	if enabled, _ := found["enabled"].(bool); !enabled {
		t.Fatalf("expected enabled=true after re-enable, got %v", found["enabled"])
	}
}

func TestSkillsAreScopedPerUser(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())

	app, identity := newSkillsTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	adminToken := loginAs(t, router, "admin@skills.test", "adminpass")

	bobHash, err := db.HashPassword("bobpass")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := identity.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "bob@skills.test",
		PasswordHash: bobHash,
		DisplayName:  "Bob",
	}); err != nil {
		t.Fatalf("create bob: %v", err)
	}
	bobToken := loginAs(t, router, "bob@skills.test", "bobpass")

	createSkillForTest(t, router, adminToken, "team-only", "Use the admin scoped skill")

	principal, err := app.backend.Auth.ResolvePrincipal(context.Background(), adminToken)
	if err != nil {
		t.Fatalf("resolve principal: %v", err)
	}
	ownerSkillPath := filepath.Join(publicskills.UserPath(principal.User.ID), "team-only", "skill.md")
	if _, err := os.Stat(ownerSkillPath); err != nil {
		t.Fatalf("expected created skill file at %s: %v", ownerSkillPath, err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/skills/team-only/content", nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-user skill content: expected 404, got %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/v1/skills/team-only", nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-user skill delete: expected 404, got %d body=%s", rec.Code, rec.Body.String())
	}

	if _, err := os.Stat(ownerSkillPath); err != nil {
		t.Fatalf("owner skill should remain after cross-user attempts: %v", err)
	}
}

func TestSkillReposAvailableToMembers(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())

	app, identity := newSkillsTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	memberHash, err := db.HashPassword("memberpass")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := identity.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "member@skills.test",
		PasswordHash: memberHash,
		DisplayName:  "Member",
	}); err != nil {
		t.Fatalf("create member: %v", err)
	}
	memberToken := loginAs(t, router, "member@skills.test", "memberpass")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/skills/repos", nil)
	req.Header.Set("Authorization", "Bearer "+memberToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("member repo list: expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/v1/skills/repos/demo", nil)
	req.Header.Set("Authorization", "Bearer "+memberToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code == http.StatusForbidden || rec.Code == http.StatusUnauthorized {
		t.Fatalf("member repo delete must not be role-gated, got %d body=%s", rec.Code, rec.Body.String())
	}
}

// ─── isRestrictedSkillSource ─────────────────────────────────────────────────

func TestIsRestrictedSkillSource(t *testing.T) {
	// Use a temp dir as the runtime root so paths are deterministic.
	base := t.TempDir()
	t.Setenv("SESHAT_RUNTIME_ROOT", base)

	managed := skillsloader.GetManagedSkillsPath()
	builtin := skillsloader.GetBuiltinSkillsPath()
	repos := skillsloader.GetSkillReposPath()
	user := skillsloader.GetUserSkillsPath()

	cases := []struct {
		root string
		want bool
		desc string
	}{
		{managed, true, "managed root is restricted"},
		{filepath.Join(managed, "policy-skill"), true, "subdirectory of managed is restricted"},
		{builtin, true, "builtin root is restricted"},
		{filepath.Join(builtin, "built-in-skill"), true, "subdirectory of builtin is restricted"},
		{repos, false, "repos dir is not restricted"},
		{filepath.Join(repos, "paperasse"), false, "installed repo skill is not restricted"},
		{user, false, "user skills dir is not restricted"},
		{filepath.Join(user, "my-skill"), false, "user skill is not restricted"},
		{filepath.Join(base, "some-other-dir"), false, "arbitrary path under runtime root is not restricted"},
		{"/tmp/some/random/path", false, "arbitrary absolute path is not restricted"},
	}

	svc := backendskills.NewService()
	for _, tc := range cases {
		got := svc.IsRestrictedSource(tc.root)
		if got != tc.want {
			t.Errorf("%s: IsRestrictedSource(%q) = %v, want %v", tc.desc, tc.root, got, tc.want)
		}
	}
}

// TestIsRestrictedSkillSource_NoPrefixConfusion verifies that a path that is a
// string prefix of the managed path but not an actual subdirectory is rejected.
func TestIsRestrictedSkillSource_NoPrefixConfusion(t *testing.T) {
	base := t.TempDir()
	t.Setenv("SESHAT_RUNTIME_ROOT", base)

	managed := skillsloader.GetManagedSkillsPath()
	// e.g. managed = /tmp/xyz/skills/managed
	// managedsuffix would be /tmp/xyz/skills/managed-extra — not a subpath.
	notSubpath := managed + "-extra"
	if backendskills.NewService().IsRestrictedSource(notSubpath) {
		t.Errorf("IsRestrictedSource(%q) should be false — it is not inside the managed dir", notSubpath)
	}
}

func TestValidateSkillRepoURL_HTTPSRequired(t *testing.T) {
	cases := []struct {
		url     string
		wantErr bool
		desc    string
	}{
		{"http://github.com/foo/bar", true, "http:// doit être rejeté"},
		{"git://github.com/foo/bar", true, "git:// doit être rejeté"},
		{"file:///etc/passwd", true, "file:// doit être rejeté"},
		{"github.com/foo/bar", true, "URL sans schéma doit être rejetée"},
		{"https://github.com/foo/bar", false, "https github.com valide"},
		{"https://gitlab.com/foo/bar", false, "https gitlab.com valide"},
		{"https://bitbucket.org/foo/bar", false, "https bitbucket.org valide"},
		{"https://codeberg.org/foo/bar", false, "https codeberg.org valide"},
	}
	for _, tc := range cases {
		err := validateSkillRepoURL(tc.url, nil)
		if tc.wantErr && err == nil {
			t.Errorf("%s: expected error for %q, got nil", tc.desc, tc.url)
		}
		if !tc.wantErr && err != nil {
			t.Errorf("%s: unexpected error for %q: %v", tc.desc, tc.url, err)
		}
	}
}

func TestValidateSkillRepoURL_HostAllowlist(t *testing.T) {
	// Hôte non dans la liste par défaut.
	err := validateSkillRepoURL("https://notallowed.example.com/foo/bar", nil)
	if err == nil {
		t.Error("expected error for unlisted host, got nil")
	}

	// Hôte explicitement autorisé par l'opérateur.
	err = validateSkillRepoURL("https://mygitlab.company.com/foo/bar", []string{"mygitlab.company.com"})
	if err != nil {
		t.Errorf("expected nil for operator-allowed host, got %v", err)
	}

	// www. prefix ignoré.
	err = validateSkillRepoURL("https://www.github.com/foo/bar", nil)
	if err != nil {
		t.Errorf("expected nil for www.github.com (strips www.), got %v", err)
	}
}

func TestValidateSkillRepoURL_EmptyURL(t *testing.T) {
	err := validateSkillRepoURL("", nil)
	if err == nil {
		t.Error("expected error for empty URL, got nil")
	}
}

func TestParseSkillRepoHosts(t *testing.T) {
	hosts := ParseSkillRepoHosts("github.com, MyGitLab.COMPANY.com, , ")
	if len(hosts) != 2 {
		t.Fatalf("expected 2 hosts, got %d: %v", len(hosts), hosts)
	}
	if hosts[0] != "github.com" {
		t.Errorf("expected github.com, got %q", hosts[0])
	}
	if hosts[1] != "mygitlab.company.com" {
		t.Errorf("expected mygitlab.company.com (lowercased), got %q", hosts[1])
	}
}

func TestParseSkillRepoHosts_Empty(t *testing.T) {
	if got := ParseSkillRepoHosts(""); len(got) != 0 {
		t.Errorf("expected 0 hosts for empty input, got %d", len(got))
	}
}

type fakeWebSearchRunner struct {
	mu          sync.Mutex
	lastRequest backendwebsearch.SearchRunRequest
	responses   map[string]*backendwebsearch.SearchRunResult
	errors      map[string]error
	envResult   *backendwebsearch.SearchRunResult
	envError    error
}

func newFakeWebSearchRunner() *fakeWebSearchRunner {
	return &fakeWebSearchRunner{
		responses: make(map[string]*backendwebsearch.SearchRunResult),
		errors:    make(map[string]error),
	}
}

func (r *fakeWebSearchRunner) Search(_ context.Context, request backendwebsearch.SearchRunRequest) (*backendwebsearch.SearchRunResult, error) {
	r.mu.Lock()
	r.lastRequest = request
	r.mu.Unlock()

	var lastErr error
	for _, provider := range request.Providers {
		key := provider.SettingID
		if key == "" {
			key = provider.Provider
		}
		if err := r.errors[key]; err != nil {
			lastErr = err
			continue
		}
		if response := r.responses[key]; response != nil {
			out := *response
			if out.ProviderSettingID == "" {
				out.ProviderSettingID = provider.SettingID
			}
			if out.Provider == "" {
				out.Provider = provider.Provider
			}
			return &out, nil
		}
	}
	if request.AllowEnvFallback {
		if r.envResult != nil {
			out := *r.envResult
			return &out, nil
		}
		if r.envError != nil {
			return nil, r.envError
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no fake provider response configured")
}

func (r *fakeWebSearchRunner) LastRequest() backendwebsearch.SearchRunRequest {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.lastRequest
}

func newWebSearchTestApp(t *testing.T, runner *fakeWebSearchRunner) (*App, *db.IdentityStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "web-search-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	settingStore, err := db.NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	webSearchSettingStore, err := db.NewWebSearchSettingStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchSettingStore: %v", err)
	}
	webSearchLogStore, err := db.NewWebSearchLogStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchLogStore: %v", err)
	}

	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@websearch.test",
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
			Identity:          identity,
			SettingStore:      settingStore,
			WebSearchSettings: webSearchSettingStore,
			WebSearchLogs:     webSearchLogStore,
			WebSearchRunner:   runner,
		}),
	}
	return app, identity
}

func createSearchProviderSetting(t *testing.T, router http.Handler, token string, provider, authKind, apiKey, baseURL string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{
		"provider":  provider,
		"name":      provider + "-setting",
		"auth_kind": authKind,
		"api_key":   apiKey,
		"base_url":  baseURL,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create provider setting: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode provider setting: %v", err)
	}
	return resp["id"].(string)
}

func TestWebSearchFallbackAndLogs(t *testing.T) {
	runner := newFakeWebSearchRunner()
	app, _ := newWebSearchTestApp(t, runner)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@websearch.test", "adminpass")

	exaID := createSearchProviderSetting(t, router, token, "exa", "api_key", "bad-key", "")
	tavilyID := createSearchProviderSetting(t, router, token, "tavily", "api_key", "good-key", "")

	runner.errors[exaID] = fmt.Errorf("exa unavailable")
	runner.responses[tavilyID] = &backendwebsearch.SearchRunResult{
		Provider:        "tavily",
		DurationSeconds: 0.12,
		Results: []webcore.SearchResult{
			{Title: "Go docs", URL: "https://pkg.go.dev", Description: "Go packages", Source: "tavily"},
		},
	}

	settingsBody, _ := json.Marshal(map[string]any{
		"enabled":              true,
		"provider_setting_ids": []string{exaID, tavilyID},
		"allow_env_fallback":   false,
		"max_queries_per_day":  5,
	})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/web/search/settings", bytes.NewReader(settingsBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update web search settings: got %d, body=%s", rec.Code, rec.Body.String())
	}

	searchBody, _ := json.Marshal(map[string]any{"query": "golang packages"})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/web/search", bytes.NewReader(searchBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("web search: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode search response: %v", err)
	}
	if resp["provider"] != "tavily" {
		t.Fatalf("expected tavily provider, got %v", resp["provider"])
	}
	if resp["provider_setting_id"] != tavilyID {
		t.Fatalf("expected tavily provider setting id, got %v", resp["provider_setting_id"])
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/web/search/logs", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list web search logs: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var logsResp map[string]any
	json.NewDecoder(rec.Body).Decode(&logsResp)
	if int(logsResp["count"].(float64)) != 1 {
		t.Fatalf("expected 1 web search log, got %v", logsResp["count"])
	}
	logs := logsResp["logs"].([]any)
	firstLog := logs[0].(map[string]any)
	if firstLog["provider"] != "tavily" || firstLog["status"] != backendwebsearch.LogStatusSuccess {
		t.Fatalf("unexpected log payload: %+v", firstLog)
	}
}

func TestWebSearchPolicyFilteringAndQuota(t *testing.T) {
	runner := newFakeWebSearchRunner()
	app, _ := newWebSearchTestApp(t, runner)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@websearch.test", "adminpass")

	ddgID := createSearchProviderSetting(t, router, token, "ddg", "none", "", "")
	runner.responses[ddgID] = &backendwebsearch.SearchRunResult{
		Provider:        "ddg",
		DurationSeconds: 0.05,
		Results: []webcore.SearchResult{
			{Title: "Go docs", URL: "https://docs.go.dev", Description: "Official docs", Source: "duckduckgo"},
		},
	}

	settingsBody, _ := json.Marshal(map[string]any{
		"enabled":              true,
		"provider_setting_ids": []string{ddgID},
		"allow_env_fallback":   false,
		"allowed_domains":      []string{"docs.go.dev"},
		"blocked_domains":      []string{"example.com"},
		"max_queries_per_day":  1,
	})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/web/search/settings", bytes.NewReader(settingsBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update web search settings: got %d, body=%s", rec.Code, rec.Body.String())
	}

	searchBody, _ := json.Marshal(map[string]any{
		"query":           "go docs",
		"allowed_domains": []string{"docs.go.dev", "pkg.go.dev"},
		"blocked_domains": []string{"evil.com"},
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/web/search", bytes.NewReader(searchBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("web search: got %d, body=%s", rec.Code, rec.Body.String())
	}
	lastRequest := runner.LastRequest()
	if len(lastRequest.AllowedDomains) != 1 || lastRequest.AllowedDomains[0] != "docs.go.dev" {
		t.Fatalf("expected filtered allowed domains, got %#v", lastRequest.AllowedDomains)
	}
	if len(lastRequest.BlockedDomains) != 2 {
		t.Fatalf("expected merged blocked domains, got %#v", lastRequest.BlockedDomains)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/v1/web/search", bytes.NewReader(searchBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected quota failure 429, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestWebSearchSettingsAreScoped(t *testing.T) {
	runner := newFakeWebSearchRunner()
	app, identity := newWebSearchTestApp(t, runner)
	router := CreateRouter(defaultAPIConfig, app)
	adminToken := loginAs(t, router, "admin@websearch.test", "adminpass")

	bobHash, err := db.HashPassword("bobpass")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if _, err := identity.CreateUser(context.Background(), db.CreateUserParams{
		Email:        "bob@websearch.test",
		PasswordHash: bobHash,
		DisplayName:  "Bob",
	}); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	bobToken := loginAs(t, router, "bob@websearch.test", "bobpass")

	ddgID := createSearchProviderSetting(t, router, adminToken, "ddg", "none", "", "")
	runner.responses[ddgID] = &backendwebsearch.SearchRunResult{
		Provider:        "ddg",
		DurationSeconds: 0.05,
		Results: []webcore.SearchResult{
			{Title: "Go docs", URL: "https://docs.go.dev", Description: "Official docs", Source: "duckduckgo"},
		},
	}

	settingsBody, _ := json.Marshal(map[string]any{
		"enabled":              true,
		"provider_setting_ids": []string{ddgID},
		"allow_env_fallback":   false,
	})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/web/search/settings", bytes.NewReader(settingsBody))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin update web search settings: got %d, body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/web/search/settings", nil)
	req.Header.Set("Authorization", "Bearer "+bobToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("bob get web search settings: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var settingsResp map[string]any
	json.NewDecoder(rec.Body).Decode(&settingsResp)
	if providerIDs, _ := settingsResp["provider_setting_ids"].([]any); len(providerIDs) != 0 {
		t.Fatalf("expected bob to have isolated web search settings, got %v", providerIDs)
	}

	searchBody, _ := json.Marshal(map[string]any{
		"query":               "go docs",
		"provider_setting_id": ddgID,
	})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/web/search", bytes.NewReader(searchBody))
	req.Header.Set("Authorization", "Bearer "+bobToken)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected bob explicit provider setting access to be forbidden, got %d body=%s", rec.Code, rec.Body.String())
	}
}
