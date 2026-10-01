package mcp

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	enginemcp "github.com/KPO-Tech/seshat/pkg/mcp"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// mockRuntime satisfies RuntimeReloader without a real SDK client.
type mockRuntime struct {
	reloadErr error
	result    *sdk.MCPIntegrationResult
	received  []sdk.MCPServerConfig // captured by ReloadMCPServers
}

func (m *mockRuntime) ReloadMCPServers(_ context.Context, servers []sdk.MCPServerConfig) error {
	m.received = servers
	return m.reloadErr
}

func (m *mockRuntime) MCPResult() *sdk.MCPIntegrationResult {
	return m.result
}

// ─── nil store guard ──────────────────────────────────────────────────────────

func TestNilStoreReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{Store: nil})
	ctx := context.Background()

	check := func(name string, err error) {
		t.Helper()
		if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
			t.Errorf("%s: expected unavailable error, got %v", name, err)
		}
	}

	_, err := svc.List(ctx)
	check("List", err)

	_, err = svc.ListEnabled(ctx)
	check("ListEnabled", err)

	_, err = svc.GetByID(ctx, "x")
	check("GetByID", err)

	_, err = svc.Create(ctx, CreateParams{Name: "x"})
	check("Create", err)

	_, err = svc.Update(ctx, "x", UpdateParams{})
	check("Update", err)

	check("Delete", svc.Delete(ctx, "x"))

	_, err = svc.ImportFromMcpJSON(ctx, enginemcp.McpJsonConfig{})
	check("ImportFromMcpJSON", err)
}

// ─── nil runtime guard ────────────────────────────────────────────────────────

func TestReloadNilRuntimeReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{})
	_, err := svc.Reload(context.Background(), "", "")
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Fatalf("expected unavailable, got %v", err)
	}
}

func TestStatusNilRuntimeReturnsNil(t *testing.T) {
	svc := NewService(ServiceConfig{})
	if got := svc.Status(); got != nil {
		t.Errorf("expected nil for nil runtime, got %v", got)
	}
}

func TestStatusNilMCPResultReturnsNil(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &mockRuntime{result: nil}})
	if got := svc.Status(); got != nil {
		t.Errorf("expected nil for nil MCPResult, got %v", got)
	}
}

// ─── Status mapping ───────────────────────────────────────────────────────────

func TestStatusMapsServerResults(t *testing.T) {
	connectErr := errors.New("connection refused")
	rt := &mockRuntime{
		result: &sdk.MCPIntegrationResult{
			ServerResults: []sdk.MCPServerResult{
				{Name: "ok-server", ToolsRegistered: 5, Error: nil},
				{Name: "bad-server", ToolsRegistered: 0, Error: connectErr},
			},
		},
	}
	svc := NewService(ServiceConfig{Runtime: rt})
	statuses := svc.Status()

	if len(statuses) != 2 {
		t.Fatalf("expected 2 statuses, got %d", len(statuses))
	}

	ok := statuses[0]
	if ok.Name != "ok-server" || !ok.OK || ok.Tools != 5 || ok.Error != "" {
		t.Errorf("ok-server: unexpected status %+v", ok)
	}

	bad := statuses[1]
	if bad.Name != "bad-server" || bad.OK || bad.Tools != 0 || bad.Error != "connection refused" {
		t.Errorf("bad-server: unexpected status %+v", bad)
	}
}

func TestStatusEmptyServerResults(t *testing.T) {
	rt := &mockRuntime{
		result: &sdk.MCPIntegrationResult{ServerResults: nil},
	}
	svc := NewService(ServiceConfig{Runtime: rt})
	if got := svc.Status(); len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

// ─── ToSDKConfig ──────────────────────────────────────────────────────────────

func TestServerToSDKConfig(t *testing.T) {
	srv := Server{
		Name:        "my-server",
		Command:     "npx",
		Args:        []string{"-y", "@modelcontextprotocol/server-github"},
		URL:         "https://example.com/mcp",
		ServerType:  "stdio",
		Env:         map[string]string{"GITHUB_TOKEN": "secret"},
		Headers:     map[string]string{"Authorization": "Bearer x"},
		TimeoutSecs: 45,
	}
	cfg := srv.ToSDKConfig()

	if cfg.Name != srv.Name {
		t.Errorf("Name: want %q, got %q", srv.Name, cfg.Name)
	}
	if cfg.Command != srv.Command {
		t.Errorf("Command: want %q, got %q", srv.Command, cfg.Command)
	}
	if len(cfg.Args) != len(srv.Args) || cfg.Args[0] != srv.Args[0] {
		t.Errorf("Args: want %v, got %v", srv.Args, cfg.Args)
	}
	if cfg.URL != srv.URL {
		t.Errorf("URL: want %q, got %q", srv.URL, cfg.URL)
	}
	if string(cfg.Transport) != srv.ServerType {
		t.Errorf("Transport: want %q, got %q", srv.ServerType, string(cfg.Transport))
	}
	if cfg.Env["GITHUB_TOKEN"] != "secret" {
		t.Errorf("Env: want GITHUB_TOKEN=secret, got %v", cfg.Env)
	}
	if cfg.Headers["Authorization"] != "Bearer x" {
		t.Errorf("Headers: unexpected %v", cfg.Headers)
	}
	if want := 45 * time.Second; cfg.Timeout != want {
		t.Errorf("Timeout: want %v, got %v", want, cfg.Timeout)
	}
}

func TestServerToSDKConfigZeroTimeout(t *testing.T) {
	srv := Server{Name: "s", TimeoutSecs: 0}
	if cfg := srv.ToSDKConfig(); cfg.Timeout != 0 {
		t.Errorf("expected zero timeout, got %v", cfg.Timeout)
	}
}
