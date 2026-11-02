package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// fakeProtector records what the handler asks of the sidecar.
type fakeProtector struct {
	available  bool
	protected  [][]string
	removed    [][]string
	protectErr error
	sids       []string
}

func (f *fakeProtector) Available() bool           { return f.available }
func (f *fakeProtector) UnavailableReason() string { return "not in this build" }
func (f *fakeProtector) Protect(_ context.Context, sid string, paths []string) error {
	f.sids = append(f.sids, sid)
	if f.protectErr != nil {
		return f.protectErr
	}
	f.protected = append(f.protected, paths)
	return nil
}
func (f *fakeProtector) Unprotect(_ context.Context, sid string, paths []string) error {
	f.sids = append(f.sids, sid)
	f.removed = append(f.removed, paths)
	return nil
}

func sandboxTestApp(t *testing.T, protector *fakeProtector, defaults []string) *App {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "sandbox.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewSandboxConfigStore(database)
	if err != nil {
		t.Fatalf("NewSandboxConfigStore: %v", err)
	}
	return &App{sandboxConfigStore: store, sandboxProject: protector, sandboxDefaultDenyRead: defaults}
}

func sandboxRequest(t *testing.T, app *App, method, body string) (int, sandboxConfigResponse, string) {
	t.Helper()
	req := withPrincipal(httptest.NewRequest(method, "/api/v1/settings/sandbox", strings.NewReader(body)), "u1")
	rec := httptest.NewRecorder()
	app.handleSandboxConfig(rec, req)
	var resp sandboxConfigResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	return rec.Code, resp, rec.Body.String()
}

func TestSandboxStaysOffUntilChosenAndShowsWhatItWouldProtect(t *testing.T) {
	protector := &fakeProtector{available: true}
	app := sandboxTestApp(t, protector, []string{`C:\home\.ssh`})

	code, resp, body := sandboxRequest(t, app, http.MethodGet, "")
	if code != http.StatusOK {
		t.Fatalf("%d: %s", code, body)
	}
	if resp.Mode != db.SandboxModeLocal || !resp.ProjectAvailable {
		t.Fatalf("got %+v", resp)
	}
	if !reflect.DeepEqual(resp.DenyRead, []string{`C:\home\.ssh`}) {
		t.Fatalf("the default list must be visible: %v", resp.DenyRead)
	}
	if len(protector.protected) != 0 {
		t.Fatal("looking at the settings must not touch the disk")
	}
}

func TestChoosingTheSandboxProtectsBeforeItSaves(t *testing.T) {
	protector := &fakeProtector{available: true}
	app := sandboxTestApp(t, protector, []string{`C:\home\.ssh`})

	code, resp, body := sandboxRequest(t, app, http.MethodPut, `{"mode":"project"}`)
	if code != http.StatusOK {
		t.Fatalf("%d: %s", code, body)
	}
	if resp.Mode != db.SandboxModeProject {
		t.Fatalf("got %+v", resp)
	}
	if !reflect.DeepEqual(protector.protected, [][]string{{`C:\home\.ssh`}}) {
		t.Fatalf("protected %v", protector.protected)
	}
	first := protector.sids[0]
	if !strings.HasPrefix(first, "S-1-5-21-") {
		t.Fatalf("sid %q", first)
	}

	// The identity stays, or a refusal could never be taken back.
	if code, _, body := sandboxRequest(t, app, http.MethodPut, `{"mode":"project"}`); code != http.StatusOK {
		t.Fatalf("%d: %s", code, body)
	}
	cfg, err := app.sandboxConfigStore.Get(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CapabilitySID != first || protector.sids[1] != first {
		t.Fatalf("the identity changed: %q then %q, stored %q", first, protector.sids[1], cfg.CapabilitySID)
	}
}

func TestAFolderThatCannotBeProtectedLeavesTheModeAsItWas(t *testing.T) {
	protector := &fakeProtector{available: true, protectErr: errors.New(`could not protect C:\locked: denied`)}
	app := sandboxTestApp(t, protector, []string{`C:\locked`})

	code, _, body := sandboxRequest(t, app, http.MethodPut, `{"mode":"project"}`)
	if code != http.StatusBadRequest || !strings.Contains(body, `C:\\locked`) {
		t.Fatalf("expected a refusal naming the folder, got %d: %s", code, body)
	}
	cfg, err := app.sandboxConfigStore.Get(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if cfg != nil && cfg.Mode == db.SandboxModeProject {
		t.Fatal("the mode was saved although nothing is protected")
	}
}

func TestTheSandboxCannotBeChosenWhereItCannotRun(t *testing.T) {
	app := sandboxTestApp(t, &fakeProtector{}, nil)
	code, _, body := sandboxRequest(t, app, http.MethodPut, `{"mode":"project"}`)
	if code != http.StatusBadRequest || !strings.Contains(body, "not in this build") {
		t.Fatalf("got %d: %s", code, body)
	}
	_, resp, _ := sandboxRequest(t, app, http.MethodGet, "")
	if resp.ProjectAvailable || resp.ProjectUnavailableReason != "not in this build" {
		t.Fatalf("got %+v", resp)
	}
}

func TestTakingAPathOffTheListGivesAccessBack(t *testing.T) {
	// Absolute on the platform running the test: the handler keeps nothing else.
	dir := t.TempDir()
	ssh, aws := filepath.Join(dir, ".ssh"), filepath.Join(dir, ".aws")
	protector := &fakeProtector{available: true}
	app := sandboxTestApp(t, protector, []string{ssh, aws})
	if code, _, body := sandboxRequest(t, app, http.MethodPut, `{"mode":"project"}`); code != http.StatusOK {
		t.Fatalf("%d: %s", code, body)
	}

	list, err := json.Marshal(map[string][]string{"deny_read": {ssh, "relative"}})
	if err != nil {
		t.Fatal(err)
	}
	code, resp, body := sandboxRequest(t, app, http.MethodPut, string(list))
	if code != http.StatusOK {
		t.Fatalf("%d: %s", code, body)
	}
	if resp.Mode != db.SandboxModeProject {
		t.Fatalf("the mode must stay: %+v", resp)
	}
	if !reflect.DeepEqual(protector.removed, [][]string{{aws}}) {
		t.Fatalf("removed %v", protector.removed)
	}
	if !reflect.DeepEqual(resp.DenyRead, []string{ssh}) {
		t.Fatalf("a relative path must not be kept: %v", resp.DenyRead)
	}

	// An empty list stays empty rather than going back to the defaults.
	if code, resp, body := sandboxRequest(t, app, http.MethodPut, `{"deny_read":[]}`); code != http.StatusOK || len(resp.DenyRead) != 0 {
		t.Fatalf("%d: %s", code, body)
	}
}

// A request that will be refused must not change anything on the disk first.
func TestAnUnknownModeTouchesNothing(t *testing.T) {
	protector := &fakeProtector{available: true}
	app := sandboxTestApp(t, protector, []string{`C:\home\.ssh`})
	sandboxRequest(t, app, http.MethodPut, `{"mode":"project"}`)

	code, _, body := sandboxRequest(t, app, http.MethodPut, `{"mode":"root","deny_read":[]}`)
	if code != http.StatusBadRequest {
		t.Fatalf("%d: %s", code, body)
	}
	if len(protector.removed) != 0 {
		t.Fatalf("a refused request took a protection back: %v", protector.removed)
	}
}

func TestLeavingTheSandboxKeepsItsIdentityForLater(t *testing.T) {
	protector := &fakeProtector{available: true}
	app := sandboxTestApp(t, protector, []string{`C:\home\.ssh`})
	sandboxRequest(t, app, http.MethodPut, `{"mode":"project"}`)
	before, _ := app.sandboxConfigStore.Get(context.Background())

	code, resp, body := sandboxRequest(t, app, http.MethodPut, `{"mode":"local"}`)
	if code != http.StatusOK || resp.Mode != db.SandboxModeLocal {
		t.Fatalf("%d: %s", code, body)
	}
	after, _ := app.sandboxConfigStore.Get(context.Background())
	if after.CapabilitySID == "" || after.CapabilitySID != before.CapabilitySID {
		t.Fatalf("identity %q then %q", before.CapabilitySID, after.CapabilitySID)
	}
}
