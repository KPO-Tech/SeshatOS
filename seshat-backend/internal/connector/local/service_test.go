package local

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector/gateway"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/mcp"
)

// fakeRuntime stands in for the MCP service: it records reloads and answers as the runtime would for each connector server.
type fakeRuntime struct {
	reloads  int
	failWith map[string]string
	err      error
	tools    map[string][]mcp.ToolInfo
}

func (f *fakeRuntime) Reload(context.Context) ([]mcp.ServerStatus, error) {
	f.reloads++
	if f.err != nil {
		return nil, f.err
	}
	var statuses []mcp.ServerStatus
	for _, definition := range connector.LocalCatalog() {
		status := mcp.ServerStatus{Name: definition.ServerName(), OK: true}
		if reason, failing := f.failWith[definition.ServerName()]; failing {
			status.OK, status.Error = false, reason
		}
		statuses = append(statuses, status)
	}
	return statuses, nil
}

func (f *fakeRuntime) ToolsByServer() map[string][]mcp.ToolInfo { return f.tools }

func newService(t *testing.T) (*Service, *fakeRuntime) {
	t.Helper()
	// The encryption key of the accounts lives in the home directory: keep the test out of the real one.
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "local.db")))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	accounts, err := db.NewConnectorAccountStore(database)
	if err != nil {
		t.Fatalf("accounts store: %v", err)
	}
	var service *Service
	gw := gateway.New(func(ctx context.Context, kind connector.Kind) (string, bool) { return service.Secret(ctx, kind) })
	if err := gw.Start(); err != nil {
		t.Fatalf("gateway: %v", err)
	}
	t.Cleanup(gw.Close)
	service = NewService(accounts, gw)
	runtime := &fakeRuntime{tools: map[string][]mcp.ToolInfo{}}
	service.SetRuntime(runtime)
	return service, runtime
}

func statusOf(t *testing.T, s *Service, kind string) Entry {
	t.Helper()
	for _, entry := range s.List(context.Background()) {
		if string(entry.Definition.Kind) == kind {
			return entry
		}
	}
	t.Fatalf("connector %q missing from the list", kind)
	return Entry{}
}

func TestListShowsTheWholeCatalogDisconnected(t *testing.T) {
	service, _ := newService(t)
	entries := service.List(context.Background())
	if len(entries) != len(connector.LocalCatalog()) {
		t.Fatalf("expected %d connectors, got %d", len(connector.LocalCatalog()), len(entries))
	}
	for _, entry := range entries {
		if entry.Status != StatusDisconnected {
			t.Errorf("%s: expected disconnected, got %q", entry.Definition.Kind, entry.Status)
		}
	}
	if got := service.MCPConfigs(context.Background()); len(got) != 0 {
		t.Fatalf("nothing is connected, yet the runtime would load %d servers", len(got))
	}
}

func TestConnectKeepsTheKeyLoadsTheServerAndListsItsTools(t *testing.T) {
	service, runtime := newService(t)
	ctx := context.Background()
	runtime.tools["connector-github"] = []mcp.ToolInfo{{Name: "search_repositories", Description: "Search"}}

	entry, err := service.Connect(ctx, "user-1", "github", "  ghp_secret  ")
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if entry.Status != StatusConnected || len(entry.Tools) != 1 || entry.Tools[0].Name != "search_repositories" {
		t.Fatalf("expected a connected connector with its tool, got %+v", entry)
	}
	if runtime.reloads != 1 {
		t.Fatalf("expected one reload, got %d", runtime.reloads)
	}
	if key, ok := service.Secret(ctx, "github"); !ok || key != "ghp_secret" {
		t.Fatalf("the key must be kept trimmed and retrievable for the gateway, got %q %v", key, ok)
	}
	configs := service.MCPConfigs(ctx)
	if len(configs) != 1 || configs[0].Name != "connector-github" {
		t.Fatalf("expected the github server to be loaded, got %+v", configs)
	}
	if !strings.HasPrefix(configs[0].URL, "http://127.0.0.1:") {
		t.Fatalf("the runtime must reach the connector through the loopback gateway, got %q", configs[0].URL)
	}
	for name, value := range configs[0].Headers {
		if strings.Contains(value, "ghp_secret") {
			t.Fatalf("the key must never be in the runtime's configuration (header %s)", name)
		}
	}
	if len(configs[0].Env) != 0 {
		t.Fatalf("the key must never be in the runtime's environment: %+v", configs[0].Env)
	}
}

func TestConnectingAgainReplacesTheKeyWithoutDuplicatingTheAccount(t *testing.T) {
	service, _ := newService(t)
	ctx := context.Background()
	if _, err := service.Connect(ctx, "user-1", "linear", "first"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Connect(ctx, "user-1", "linear", "second"); err != nil {
		t.Fatal(err)
	}
	if key, _ := service.Secret(ctx, "linear"); key != "second" {
		t.Fatalf("expected the new key, got %q", key)
	}
	accounts, err := service.accounts.ListByUserID(ctx, "user-1")
	if err != nil || len(accounts) != 1 {
		t.Fatalf("expected a single account, got %d (%v)", len(accounts), err)
	}
}

func TestAKeyTheVendorRefusesLeavesTheConnectorInError(t *testing.T) {
	service, runtime := newService(t)
	runtime.failWith = map[string]string{"connector-stripe": "HTTP error: 401 Unauthorized"}

	entry, err := service.Connect(context.Background(), "user-1", "stripe", "rk_bad")
	if err != nil {
		t.Fatalf("a refused key is a state, not a Go error: %v", err)
	}
	if entry.Status != StatusError {
		t.Fatalf("expected the error state, got %q", entry.Status)
	}
	if !strings.Contains(entry.LastError, "Stripe refused") || strings.Contains(entry.LastError, "rk_bad") {
		t.Fatalf("expected a plain explanation that does not echo the key, got %q", entry.LastError)
	}
}

func TestDisconnectForgetsTheKeyAndReloads(t *testing.T) {
	service, runtime := newService(t)
	ctx := context.Background()
	if _, err := service.Connect(ctx, "user-1", "airtable", "pat"); err != nil {
		t.Fatal(err)
	}
	before := runtime.reloads
	if err := service.Disconnect(ctx, "user-1", "airtable"); err != nil {
		t.Fatalf("disconnect: %v", err)
	}
	if _, ok := service.Secret(ctx, "airtable"); ok {
		t.Fatal("the key must be gone after disconnecting")
	}
	if runtime.reloads != before+1 {
		t.Fatal("disconnecting must reload the runtime so the tools go away")
	}
	if statusOf(t, service, "airtable").Status != StatusDisconnected {
		t.Fatal("expected the connector to read as disconnected")
	}
}

func TestConnectRejectsWhatIsNotAKey(t *testing.T) {
	service, runtime := newService(t)
	ctx := context.Background()
	cases := map[string][2]string{
		"unknown kind": {"salesforce", "key"},
		"empty key":    {"github", "   "},
		"multi-line":   {"github", "line1\nline2"},
	}
	for name, c := range cases {
		if _, err := service.Connect(ctx, "user-1", c[0], c[1]); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	if runtime.reloads != 0 {
		t.Fatal("a rejected key must not reload the runtime")
	}
}

func TestAReloadErrorIsReportedOnTheConnector(t *testing.T) {
	service, runtime := newService(t)
	runtime.err = errors.New("runtime not available")
	entry, err := service.Connect(context.Background(), "user-1", "github", "k")
	if err != nil {
		t.Fatal(err)
	}
	if entry.Status != StatusError || entry.LastError != "runtime not available" {
		t.Fatalf("expected the reload error on the connector, got %+v", entry)
	}
}
