package gateway_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	sdkmcp "github.com/KPO-Tech/seshat-runtime/pkg/mcp"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector/gateway"
)

// vendor stands in for a vendor-hosted MCP server the way the real ones behave: it insists on the key as a bearer token and on an Accept
// header that allows event streams, hands out a session id at initialize and then requires it, answers some calls as a server-sent-event
// stream (with a progress message ahead of the answer) and acknowledges notifications with 202.
type vendor struct {
	key string

	mu       sync.Mutex
	sessions map[string]bool
	ready    map[string]bool
	calls    []string
}

func (v *vendor) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer "+v.key {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	accept := r.Header.Get("Accept")
	if !strings.Contains(accept, "application/json") || !strings.Contains(accept, "text/event-stream") {
		http.Error(w, "not acceptable", http.StatusNotAcceptable)
		return
	}
	body, _ := io.ReadAll(r.Body)
	var request struct {
		ID     json.RawMessage `json:"id"`
		Method string          `json:"method"`
		Params map[string]any  `json:"params"`
	}
	if err := json.Unmarshal(body, &request); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	v.mu.Lock()
	v.calls = append(v.calls, request.Method)
	v.mu.Unlock()

	if request.Method != "initialize" {
		session := r.Header.Get("Mcp-Session-Id")
		v.mu.Lock()
		known, ready := v.sessions[session], v.ready[session]
		v.mu.Unlock()
		if !known {
			http.Error(w, "missing or unknown session", http.StatusBadRequest)
			return
		}
		if request.Method == "notifications/initialized" {
			v.mu.Lock()
			v.ready[session] = true
			v.mu.Unlock()
		} else if !ready {
			http.Error(w, "the handshake was not completed with notifications/initialized", http.StatusBadRequest)
			return
		} else if r.Header.Get("MCP-Protocol-Version") != "2025-03-26" {
			http.Error(w, "missing MCP-Protocol-Version", http.StatusBadRequest)
			return
		}
	}

	switch request.Method {
	case "initialize":
		session := fmt.Sprintf("session-%d", time.Now().UnixNano())
		v.mu.Lock()
		v.sessions[session] = true
		v.mu.Unlock()
		w.Header().Set("Mcp-Session-Id", session)
		v.eventStream(w, request.ID, map[string]any{
			"protocolVersion": "2025-03-26",
			"serverInfo":      map[string]any{"name": "vendor", "version": "1"},
			"capabilities":    map[string]any{"tools": map[string]any{}},
		})
	case "notifications/initialized":
		w.WriteHeader(http.StatusAccepted)
	case "tools/list":
		writeJSON(w, request.ID, map[string]any{"tools": []map[string]any{{
			"name": "search", "description": "Search the vendor",
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{"q": map[string]any{"type": "string"}}},
		}}})
	case "tools/call":
		name, _ := request.Params["name"].(string)
		v.eventStream(w, request.ID, map[string]any{
			"content": []map[string]any{{"type": "text", "text": "called " + name}},
		})
	default:
		writeJSON(w, request.ID, map[string]any{})
	}
}

func writeJSON(w http.ResponseWriter, id json.RawMessage, result any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
}

// eventStream answers as an SSE stream: a progress notification first, then the answer to the request.
func (v *vendor) eventStream(w http.ResponseWriter, id json.RawMessage, result any) {
	w.Header().Set("Content-Type", "text/event-stream")
	progress, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "method": "notifications/progress", "params": map[string]any{"progress": 1}})
	answer, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
	fmt.Fprintf(w, "event: message\ndata: %s\n\nevent: message\ndata: %s\n\n", progress, answer)
}

func (v *vendor) called(method string) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	for _, m := range v.calls {
		if m == method {
			return true
		}
	}
	return false
}

// connect starts a gateway whose catalog points at the stand-in and returns the runtime's own MCP client configured exactly as the
// backend configures it.
func connect(t *testing.T, definition connector.Definition, upstream *httptest.Server, key string) (*sdkmcp.Client, *gateway.Gateway) {
	t.Helper()
	g := gateway.New(
		func(_ context.Context, kind connector.Kind) (string, bool) {
			return key, kind == definition.Kind
		},
		gateway.WithUpstream(func(kind connector.Kind) (string, bool) { return upstream.URL, kind == definition.Kind }),
	)
	if err := g.Start(); err != nil {
		t.Fatalf("start gateway: %v", err)
	}
	t.Cleanup(g.Close)
	config, err := g.ServerConfig(definition)
	if err != nil {
		t.Fatalf("server config: %v", err)
	}
	client, err := sdkmcp.NewClient(sdkmcp.ServerConfig{
		Name: config.Name, URL: config.URL, Transport: config.Transport, Headers: config.Headers, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	t.Cleanup(func() { client.Close() })
	return client, g
}

// TestEveryLocalConnectorWorksEndToEnd is the third point of the admission rule: each connector of the local catalog is connected through
// the gateway to a vendor stand-in, and the runtime's client lists and calls a tool with the person's key.
func TestEveryLocalConnectorWorksEndToEnd(t *testing.T) {
	for _, definition := range connector.LocalCatalog() {
		t.Run(string(definition.Kind), func(t *testing.T) {
			const key = "key-for-" + "the-test"
			upstream := &vendor{key: key, sessions: map[string]bool{}, ready: map[string]bool{}}
			server := httptest.NewServer(upstream)
			t.Cleanup(server.Close)
			client, _ := connect(t, definition, server, key)
			ctx := context.Background()

			if err := client.Start(ctx); err != nil {
				t.Fatalf("start: %v", err)
			}
			if _, err := client.Initialize(ctx); err != nil {
				t.Fatalf("initialize through the gateway: %v", err)
			}
			tools, err := client.ListTools(ctx)
			if err != nil {
				t.Fatalf("list tools: %v", err)
			}
			if len(tools) != 1 || tools[0].Name != "search" {
				t.Fatalf("expected the vendor's search tool, got %+v", tools)
			}
			result, err := client.CallTool(ctx, "search", map[string]any{"q": "x"})
			if err != nil {
				t.Fatalf("call tool (answered as an event stream): %v", err)
			}
			if !strings.Contains(fmt.Sprint(result), "called search") {
				t.Fatalf("the answer of the tool did not come through: %+v", result)
			}
			if !upstream.called("notifications/initialized") {
				t.Fatal("the initialized notification never reached the vendor")
			}
		})
	}
}

func TestGatewayRefusesRequestsWithoutItsToken(t *testing.T) {
	definition := connector.LocalCatalog()[0]
	upstream := &vendor{key: "k", sessions: map[string]bool{}, ready: map[string]bool{}}
	server := httptest.NewServer(upstream)
	t.Cleanup(server.Close)
	_, g := connect(t, definition, server, "k")
	config, _ := g.ServerConfig(definition)

	request, _ := http.NewRequest(http.MethodPost, config.URL, strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize"}`))
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("a request without the gateway token must be refused, got %s", response.Status)
	}
	if upstream.called("initialize") {
		t.Fatal("a refused request reached the vendor")
	}
}

func TestGatewayReportsAWrongKeyAsUnauthorizedWithoutLeakingIt(t *testing.T) {
	definition := connector.LocalCatalog()[0]
	server := httptest.NewServer(&vendor{key: "the-right-key", sessions: map[string]bool{}, ready: map[string]bool{}})
	t.Cleanup(server.Close)
	const wrong = "the-wrong-key-12345"
	client, _ := connect(t, definition, server, wrong)

	ctx := context.Background()
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	_, err := client.Initialize(ctx)
	if err == nil {
		t.Fatal("expected the vendor's refusal to surface")
	}
	if !strings.Contains(err.Error(), "401") {
		t.Fatalf("expected a 401, got %v", err)
	}
	if strings.Contains(err.Error(), wrong) {
		t.Fatalf("the key leaked into the error: %v", err)
	}
}

func TestGatewayDoesNotServeAnUnconnectedKind(t *testing.T) {
	definition := connector.LocalCatalog()[0]
	server := httptest.NewServer(&vendor{key: "k", sessions: map[string]bool{}, ready: map[string]bool{}})
	t.Cleanup(server.Close)
	g := gateway.New(
		func(context.Context, connector.Kind) (string, bool) { return "", false },
		gateway.WithUpstream(func(connector.Kind) (string, bool) { return server.URL, true }),
	)
	if err := g.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(g.Close)
	config, _ := g.ServerConfig(definition)
	request, _ := http.NewRequest(http.MethodPost, config.URL, strings.NewReader(`{}`))
	request.Header.Set(gateway.TokenHeader, config.Headers[gateway.TokenHeader])
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("a kind with no connected account must answer 401, got %s", response.Status)
	}
}
