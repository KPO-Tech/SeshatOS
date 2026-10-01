// Command demo-crm-mcp is a minimal, standalone MCP server exposing two
// CRM-flavored tools (create_contact, list_contacts) over HTTP, used as the
// first concrete target for connector.ActionConnector (seshat-ai roadmap
// Phase 3, "connecteur Action via MCP"). It is not a production CRM
// integration - no real external CRM was ever chosen in the product docs -
// it exists to prove the ActionConnector-via-MCP wiring against a real,
// separate process speaking the actual MCP wire protocol, not something
// faked in-process.
//
// Speaks the plain JSON-RPC-over-HTTP-POST protocol the seshat SDK's MCP
// client actually implements (internal/tools/system/mcp's HTTPTransport) -
// a single POST per call, JSON body in, JSON body out, no session headers,
// no SSE upgrade. This is deliberately NOT the official MCP Go SDK's
// "Streamable HTTP" transport, which uses a different, incompatible wire
// protocol (session IDs, SSE) - confirmed by reading the SDK client's own
// transport implementation before writing this.
//
// Requires a bearer token on every request (Authorization: Bearer <token>,
// checked against DEMO_CRM_TOKEN) - proves connector.Secret.AccessToken
// actually gets used for something, not just carried in a signature.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type jsonRPCRequest struct {
	JSONRPC string         `json:"jsonrpc"`
	ID      int64          `json:"id"`
	Method  string         `json:"method"`
	Params  map[string]any `json:"params"`
}

type contact struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	Company string `json:"company"`
}

type crmServer struct {
	expectedToken string

	mu       sync.Mutex
	contacts []contact
	nextID   int
}

func main() {
	token := strings.TrimSpace(os.Getenv("DEMO_CRM_TOKEN"))
	if token == "" {
		log.Fatal("DEMO_CRM_TOKEN is required")
	}
	port := 8090
	if raw := strings.TrimSpace(os.Getenv("DEMO_CRM_PORT")); raw != "" {
		p, err := strconv.Atoi(raw)
		if err != nil {
			log.Fatalf("invalid DEMO_CRM_PORT: %v", err)
		}
		port = p
	}

	srv := &crmServer{expectedToken: token}
	mux := http.NewServeMux()
	mux.HandleFunc("/", srv.handleRPC)

	addr := fmt.Sprintf(":%d", port)
	log.Printf("demo-crm-mcp listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func (s *crmServer) handleRPC(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req jsonRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON-RPC request: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	switch req.Method {
	case "initialize":
		s.writeResult(w, req.ID, map[string]any{
			"protocolVersion": "2025-03-26",
			"serverInfo":      map[string]any{"name": "demo-crm-mcp", "version": "1.0.0"},
			"capabilities":    map[string]any{"tools": map[string]any{}},
		})
	case "tools/list":
		s.writeResult(w, req.ID, map[string]any{
			"tools": []map[string]any{
				{"name": "create_contact", "description": "Create a CRM contact"},
				{"name": "list_contacts", "description": "List CRM contacts"},
			},
		})
	case "tools/call":
		s.handleToolCall(w, req)
	default:
		s.writeError(w, req.ID, -32601, "method not found: "+req.Method)
	}
}

func (s *crmServer) authorized(r *http.Request) bool {
	header := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	return strings.TrimPrefix(header, prefix) == s.expectedToken
}

func (s *crmServer) handleToolCall(w http.ResponseWriter, req jsonRPCRequest) {
	name, _ := req.Params["name"].(string)
	arguments, _ := req.Params["arguments"].(map[string]any)

	switch name {
	case "create_contact":
		c := s.createContact(arguments)
		s.writeResult(w, req.ID, map[string]any{
			"content": []map[string]any{{"type": "text", "text": fmt.Sprintf("Created contact %s (%s)", c.Name, c.ID)}},
			"contact": c,
		})
	case "list_contacts":
		s.mu.Lock()
		contacts := append([]contact(nil), s.contacts...)
		s.mu.Unlock()
		s.writeResult(w, req.ID, map[string]any{"contacts": contacts})
	default:
		s.writeError(w, req.ID, -32601, "unknown tool: "+name)
	}
}

func (s *crmServer) createContact(arguments map[string]any) contact {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	c := contact{
		ID:      fmt.Sprintf("contact_%d_%d", s.nextID, time.Now().UnixNano()%1000),
		Name:    stringField(arguments, "name"),
		Email:   stringField(arguments, "email"),
		Company: stringField(arguments, "company"),
	}
	s.contacts = append(s.contacts, c)
	return c
}

func stringField(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

func (s *crmServer) writeResult(w http.ResponseWriter, id int64, result map[string]any) {
	_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
}

func (s *crmServer) writeError(w http.ResponseWriter, id int64, code int, message string) {
	_ = json.NewEncoder(w).Encode(map[string]any{
		"jsonrpc": "2.0", "id": id,
		"error": map[string]any{"code": code, "message": message},
	})
}
