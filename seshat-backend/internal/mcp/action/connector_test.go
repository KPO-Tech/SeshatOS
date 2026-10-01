package action

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// jsonRPCRequestBody mirrors what Act's underlying mcp.Client actually
// sends - see seshat's pkg/mcp/mcp_test.go for the same protocol shape,
// verified against the real client there.
type jsonRPCRequestBody struct {
	JSONRPC string         `json:"jsonrpc"`
	ID      int64          `json:"id"`
	Method  string         `json:"method"`
	Params  map[string]any `json:"params"`
}

// newTestMCPServer serves just enough of the protocol (initialize,
// tools/call) to exercise Act end-to-end, and records the Authorization
// header of the last tools/call request so tests can assert Act actually
// injects connector.Secret.AccessToken rather than just carrying it.
func newTestMCPServer(t *testing.T) (server *httptest.Server, lastAuthHeader *string) {
	t.Helper()
	var captured string
	lastAuthHeader = &captured
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req jsonRPCRequestBody
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "initialize":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": req.ID,
				"result": map[string]any{
					"protocolVersion": "2025-03-26",
					"serverInfo":      map[string]any{"name": "test", "version": "1.0.0"},
					"capabilities":    map[string]any{"tools": map[string]any{}},
				},
			})
		case "tools/call":
			captured = r.Header.Get("Authorization")
			name, _ := req.Params["name"].(string)
			if name != "create_contact" {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"jsonrpc": "2.0", "id": req.ID,
					"error": map[string]any{"code": -32601, "message": "unknown tool"},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": req.ID,
				"result": map[string]any{"contact_id": "c_1"},
			})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": req.ID,
				"error": map[string]any{"code": -32601, "message": "method not found"},
			})
		}
	}))
	t.Cleanup(server.Close)
	return server, lastAuthHeader
}

func newTestStore(t *testing.T) *db.MCPServerStore {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewMCPServerStore(database)
	if err != nil {
		t.Fatalf("new mcp server store: %v", err)
	}
	return store
}

func TestConnectorActCallsToolAndInjectsBearerToken(t *testing.T) {
	server, lastAuthHeader := newTestMCPServer(t)
	store := newTestStore(t)
	ctx := context.Background()
	if _, err := store.Create(ctx, db.CreateMCPServerParams{
		Name: "demo-crm", ServerType: "http", URL: server.URL, Enabled: true, TimeoutSecs: 5,
	}); err != nil {
		t.Fatalf("create mcp server: %v", err)
	}

	c := NewConnector(store, "demo-crm")
	result, err := c.Act(ctx, connector.Account{ID: "acc_1"}, connector.Secret{AccessToken: "secret-token-123"},
		"create_contact", map[string]any{"name": "Ada Lovelace", "email": "ada@example.com"})
	if err != nil {
		t.Fatalf("Act: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected Success=true, got %+v", result)
	}
	if result.Data["contact_id"] != "c_1" {
		t.Fatalf("expected the tool's real result data to come through, got %+v", result.Data)
	}
	if *lastAuthHeader != "Bearer secret-token-123" {
		t.Fatalf("expected Authorization header \"Bearer secret-token-123\", got %q - secret.AccessToken was not actually injected", *lastAuthHeader)
	}
}

func TestConnectorActReportsUnknownToolAsUnsuccessfulNotError(t *testing.T) {
	server, _ := newTestMCPServer(t)
	store := newTestStore(t)
	ctx := context.Background()
	if _, err := store.Create(ctx, db.CreateMCPServerParams{
		Name: "demo-crm", ServerType: "http", URL: server.URL, Enabled: true, TimeoutSecs: 5,
	}); err != nil {
		t.Fatalf("create mcp server: %v", err)
	}

	c := NewConnector(store, "demo-crm")
	result, err := c.Act(ctx, connector.Account{ID: "acc_1"}, connector.Secret{}, "does_not_exist", nil)
	if err != nil {
		t.Fatalf("expected a tool-level rejection to surface as ActionResult, not a Go error: %v", err)
	}
	if result.Success {
		t.Fatal("expected Success=false for an unknown tool")
	}
}

func TestConnectorActFailsWhenServerNotConfigured(t *testing.T) {
	store := newTestStore(t)
	c := NewConnector(store, "does-not-exist")
	if _, err := c.Act(context.Background(), connector.Account{}, connector.Secret{}, "create_contact", nil); err == nil {
		t.Fatal("expected Act to fail when the target MCP server isn't configured")
	}
}

func TestConnectorKindIncludesServerName(t *testing.T) {
	c := NewConnector(newTestStore(t), "demo-crm")
	if got := c.Kind(); got != connector.Kind("mcp:demo-crm") {
		t.Fatalf("expected Kind() = \"mcp:demo-crm\", got %q", got)
	}
	if caps := c.Capabilities(); len(caps) != 1 || caps[0] != connector.CapabilityAction {
		t.Fatalf("expected exactly [CapabilityAction], got %+v", caps)
	}
}
