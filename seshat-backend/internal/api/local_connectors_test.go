package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector/gateway"
	localconnectors "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector/local"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/mcp"
)

type okRuntime struct{}

func (okRuntime) Reload(context.Context) ([]mcp.ServerStatus, error) { return nil, nil }
func (okRuntime) ToolsByServer() map[string][]mcp.ToolInfo {
	return map[string][]mcp.ToolInfo{"connector-github": {{Name: "search_repositories"}}}
}

func newLocalConnectorsApp(t *testing.T) *App {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "lc.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	accounts, err := db.NewConnectorAccountStore(database)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	var service *localconnectors.Service
	gw := gateway.New(func(ctx context.Context, kind connector.Kind) (string, bool) { return service.Secret(ctx, kind) })
	if err := gw.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(gw.Close)
	service = localconnectors.NewService(accounts, gw)
	service.SetRuntime(okRuntime{})
	return &App{backend: &seshat.App{ConnectorAccounts: accounts, LocalConnectors: service}}
}

func TestLocalConnectorCatalogListsTheBackendsConnectors(t *testing.T) {
	app := newLocalConnectorsApp(t)
	rec := httptest.NewRecorder()
	app.handleConnectorsDispatch(rec, withPrincipal(httptest.NewRequest(http.MethodGet, "/connectors/catalog", nil), "u1"))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Connectors []struct {
			Kind   string `json:"kind"`
			Status string `json:"status"`
		} `json:"connectors"`
		Count int `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Count != len(connector.LocalCatalog()) || len(body.Connectors) != body.Count {
		t.Fatalf("expected the whole catalog, got %+v", body)
	}
	for _, c := range body.Connectors {
		if c.Status != "disconnected" {
			t.Errorf("%s: expected disconnected, got %s", c.Kind, c.Status)
		}
	}
}

func TestLocalConnectorConnectAndDisconnectOverHTTP(t *testing.T) {
	app := newLocalConnectorsApp(t)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/connectors/github/connection", strings.NewReader(`{"key":"ghp_secret"}`))
	app.handleConnectorsDispatch(rec, withPrincipal(req, "u1"))
	if rec.Code != http.StatusOK {
		t.Fatalf("connect: status %d: %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "ghp_secret") {
		t.Fatal("the response must never carry the key back")
	}
	var connected struct {
		Status string `json:"status"`
		Tools  []struct {
			Name string `json:"name"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &connected); err != nil {
		t.Fatal(err)
	}
	if connected.Status != "connected" || len(connected.Tools) != 1 || connected.Tools[0].Name != "search_repositories" {
		t.Fatalf("expected a connected github with its tool, got %+v", connected)
	}

	rec = httptest.NewRecorder()
	app.handleConnectorsDispatch(rec, withPrincipal(httptest.NewRequest(http.MethodDelete, "/connectors/github/connection", nil), "u1"))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("disconnect: status %d: %s", rec.Code, rec.Body.String())
	}
}

func TestLocalConnectorRejectsAnUnknownKindAndAnEmptyKey(t *testing.T) {
	app := newLocalConnectorsApp(t)
	for name, c := range map[string][2]string{
		"unknown kind": {"/connectors/salesforce/connection", `{"key":"k"}`},
		"empty key":    {"/connectors/github/connection", `{"key":""}`},
	} {
		rec := httptest.NewRecorder()
		app.handleConnectorsDispatch(rec, withPrincipal(httptest.NewRequest(http.MethodPut, c[0], strings.NewReader(c[1])), "u1"))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", name, rec.Code)
		}
	}
}

func TestLocalConnectorCatalogIsEmptyWhenConnectedToAnOrganization(t *testing.T) {
	app := &App{backend: &seshat.App{}}
	rec := httptest.NewRecorder()
	app.handleConnectorsDispatch(rec, withPrincipal(httptest.NewRequest(http.MethodGet, "/connectors/catalog", nil), "u1"))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"count":0`) {
		t.Fatalf("expected an empty catalog, got %d %s", rec.Code, rec.Body.String())
	}
}
