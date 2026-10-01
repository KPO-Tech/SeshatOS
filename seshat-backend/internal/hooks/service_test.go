package hooks

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	cloudhooks "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/hooks"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

type recordingRuntime struct {
	lastHooks []sdk.PreToolHookConfig
}

func (r *recordingRuntime) ReloadPreToolHooks(hooks []sdk.PreToolHookConfig) error {
	r.lastHooks = hooks
	return nil
}

func TestListOrgCatalogWithoutCloudClientReturnsEmpty(t *testing.T) {
	svc := NewService(ServiceConfig{})
	out, err := svc.ListOrgCatalog(context.Background(), "token", "org_1")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(out) != 0 {
		t.Fatalf("expected an empty catalog without a cloud client, got %+v", out)
	}
}

func TestListOrgCatalogWithoutOrganizationIDReturnsEmpty(t *testing.T) {
	svc := NewService(ServiceConfig{CloudClient: cloudhooks.NewClient("http://example.com")})
	out, err := svc.ListOrgCatalog(context.Background(), "token", "")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(out) != 0 {
		t.Fatalf("expected an empty catalog without an organization id, got %+v", out)
	}
}

func TestApproveOrgHookWithoutApprovalsStoreReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{})
	if err := svc.ApproveOrgHook(context.Background(), "hook_1", "token", "org_1"); err == nil {
		t.Fatal("expected an error without an approvals store")
	}
}

func TestRevokeOrgHookApprovalWithoutApprovalsStoreReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{})
	if err := svc.RevokeOrgHookApproval(context.Background(), "hook_1", "token", "org_1"); err == nil {
		t.Fatal("expected an error without an approvals store")
	}
}

// ReloadWithoutRuntimeIsANoop is a deliberate contrast with internal/mcp's
// own Reload (which treats a nil runtime as Unavailable): hooks only ever
// exist in connected mode with no local fallback, so a caller with no
// runtime configured (e.g. a context that never wires HooksRuntime) simply
// has nothing to push - not a misconfiguration to surface as an error.
func TestReloadWithoutRuntimeIsANoop(t *testing.T) {
	svc := NewService(ServiceConfig{})
	if err := svc.Reload(context.Background(), "token", "org_1"); err != nil {
		t.Fatalf("expected no error without a runtime, got %v", err)
	}
}

func TestReloadPushesOnlyApprovedHooksToRuntime(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"hook_configs":[
			{"id":"hook_approved","name":"approved","command":"echo approved","timeout_secs":30},
			{"id":"hook_unapproved","name":"unapproved","command":"echo unapproved","timeout_secs":30}
		]}`))
	}))
	defer server.Close()

	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer database.Close()
	approvals, err := db.NewHookOrgApprovalStore(database)
	if err != nil {
		t.Fatalf("new approval store: %v", err)
	}
	if err := approvals.Approve(context.Background(), "hook_approved"); err != nil {
		t.Fatalf("approve: %v", err)
	}

	runtime := &recordingRuntime{}
	svc := NewService(ServiceConfig{
		Runtime:     runtime,
		CloudClient: cloudhooks.NewClient(server.URL),
		Approvals:   approvals,
	})

	if err := svc.Reload(context.Background(), "token", "org_1"); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if len(runtime.lastHooks) != 1 {
		t.Fatalf("expected exactly one approved hook pushed to the runtime, got %+v", runtime.lastHooks)
	}
	if runtime.lastHooks[0].Command != "echo approved" {
		t.Fatalf("expected the approved hook's command, got %+v", runtime.lastHooks[0])
	}
}
