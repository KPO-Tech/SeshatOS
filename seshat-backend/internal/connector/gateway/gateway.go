// Package gateway lets the agent runtime reach vendor-hosted MCP servers with a key it never holds.
//
// The runtime's HTTP MCP client sends one plain JSON POST per call. Vendor servers speak Streamable HTTP: they want
// "Accept: application/json, text/event-stream", may answer with a server-sent-event stream, may issue a session id, and expect the
// client to finish the handshake with notifications/initialized, which the runtime's client never sends. The gateway is a loopback
// endpoint that takes the runtime's plain request, adds the person's key and the session, completes the handshake, calls the vendor,
// and gives back a plain JSON answer. The key stays in the backend (encrypted in the connector account), never in the runtime's
// configuration.
package gateway

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
)

// TokenHeader carries the per-process secret that proves a request comes from the runtime this backend started, so another program on the
// machine cannot use a connected account through the loopback port.
const TokenHeader = "X-Seshat-Gateway"

const maxBody = 8 << 20

// SecretResolver returns the key of the connected account of a kind, and false when none is connected.
type SecretResolver func(ctx context.Context, kind connector.Kind) (string, bool)

// UpstreamResolver returns the vendor's MCP endpoint for a kind, and false when the kind is unknown.
type UpstreamResolver func(kind connector.Kind) (string, bool)

type Gateway struct {
	secrets  SecretResolver
	upstream UpstreamResolver
	client   *http.Client
	token    string

	mu       sync.Mutex
	sessions map[connector.Kind]string
	versions map[connector.Kind]string
	listener net.Listener
	server   *http.Server
}

type Option func(*Gateway)

// WithUpstream replaces where a kind is sent, for tests that stand in for the vendor.
func WithUpstream(resolve UpstreamResolver) Option {
	return func(g *Gateway) { g.upstream = resolve }
}

func New(secrets SecretResolver, options ...Option) *Gateway {
	g := &Gateway{
		secrets: secrets,
		upstream: func(kind connector.Kind) (string, bool) {
			definition, ok := connector.LookupLocal(string(kind))
			return definition.MCPURL, ok
		},
		// No overall timeout: a tool call may run long, and the runtime cancels the request when it gives up.
		client:   &http.Client{},
		token:    newToken(),
		sessions: map[connector.Kind]string{},
		versions: map[connector.Kind]string{},
	}
	for _, option := range options {
		option(g)
	}
	return g
}

func newToken() string {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		panic(fmt.Sprintf("gateway: random token: %v", err))
	}
	return hex.EncodeToString(raw)
}

// Start listens on a free loopback port.
func (g *Gateway) Start() error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.listener != nil {
		return nil
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("gateway: listen: %w", err)
	}
	server := &http.Server{Handler: g, ReadHeaderTimeout: 10 * time.Second}
	g.listener, g.server = listener, server
	go func() { _ = server.Serve(listener) }()
	return nil
}

// Close stops the listener.
func (g *Gateway) Close() {
	g.mu.Lock()
	server := g.server
	g.server, g.listener = nil, nil
	g.mu.Unlock()
	if server != nil {
		_ = server.Close()
	}
}

// ServerConfig is how the runtime reaches a connector: the gateway's address, with the per-process token as its only credential.
func (g *Gateway) ServerConfig(definition connector.Definition) (sdk.MCPServerConfig, error) {
	g.mu.Lock()
	listener := g.listener
	g.mu.Unlock()
	if listener == nil {
		return sdk.MCPServerConfig{}, errors.New("gateway: not started")
	}
	return sdk.MCPServerConfig{
		Name:      definition.ServerName(),
		URL:       fmt.Sprintf("http://%s/%s", listener.Addr().String(), definition.Kind),
		Transport: "http",
		Headers:   map[string]string{TokenHeader: g.token},
		Timeout:   60 * time.Second,
	}, nil
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(TokenHeader)), []byte(g.token)) != 1 {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	kind := connector.Kind(strings.Trim(r.URL.Path, "/"))
	endpoint, known := g.upstream(kind)
	if !known {
		http.Error(w, "unknown connector", http.StatusNotFound)
		return
	}
	secret, connected := g.secrets(r.Context(), kind)
	if !connected {
		http.Error(w, "connector is not connected", http.StatusUnauthorized)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil || len(body) > maxBody {
		http.Error(w, "request body too large or unreadable", http.StatusBadRequest)
		return
	}

	request, err := http.NewRequestWithContext(r.Context(), http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "bad upstream request", http.StatusBadGateway)
		return
	}
	g.decorate(request, kind, secret)

	response, err := g.client.Do(request)
	if err != nil {
		// The error of the HTTP client names the URL but never carries the key, which is only in a header.
		http.Error(w, "the vendor could not be reached: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer response.Body.Close()

	if id := response.Header.Get("Mcp-Session-Id"); id != "" {
		g.setSession(kind, id)
	}
	if response.StatusCode == http.StatusNotFound {
		g.setSession(kind, "")
	}
	if response.StatusCode == http.StatusAccepted || response.StatusCode == http.StatusNoContent {
		// An acknowledged notification: nothing to return, and the runtime does not read it.
		w.WriteHeader(http.StatusOK)
		return
	}
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
		http.Error(w, response.Status, response.StatusCode)
		return
	}

	var message []byte
	if strings.HasPrefix(strings.ToLower(response.Header.Get("Content-Type")), "text/event-stream") {
		message, err = messageFromEventStream(response.Body, requestID(body))
	} else {
		message, err = io.ReadAll(io.LimitReader(response.Body, maxBody))
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if requestMethod(body) == "initialize" {
		g.completeInitialize(r.Context(), kind, endpoint, secret, message)
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(message)
}

// decorate sets what a Streamable HTTP server expects on every request: the key, an Accept that allows event streams, and the session
// and protocol version agreed at initialize.
func (g *Gateway) decorate(request *http.Request, kind connector.Kind, secret string) {
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json, text/event-stream")
	request.Header.Set("Authorization", "Bearer "+secret)
	g.mu.Lock()
	session, version := g.sessions[kind], g.versions[kind]
	g.mu.Unlock()
	if session != "" {
		request.Header.Set("Mcp-Session-Id", session)
	}
	if version != "" {
		request.Header.Set("MCP-Protocol-Version", version)
	}
}

// completeInitialize finishes the handshake the runtime's client leaves open: it never sends notifications/initialized, which the MCP
// specification requires before any other request. The gateway sends it, and keeps the protocol version the server chose.
func (g *Gateway) completeInitialize(ctx context.Context, kind connector.Kind, endpoint, secret string, message []byte) {
	var answer struct {
		Result struct {
			ProtocolVersion string `json:"protocolVersion"`
		} `json:"result"`
	}
	if json.Unmarshal(message, &answer) == nil && answer.Result.ProtocolVersion != "" {
		g.mu.Lock()
		g.versions[kind] = answer.Result.ProtocolVersion
		g.mu.Unlock()
	}
	notification := []byte(`{"jsonrpc":"2.0","method":"notifications/initialized"}`)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(notification))
	if err != nil {
		return
	}
	g.decorate(request, kind, secret)
	response, err := g.client.Do(request)
	if err != nil {
		return
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
	_ = response.Body.Close()
}

func (g *Gateway) setSession(kind connector.Kind, id string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if id == "" {
		delete(g.sessions, kind)
		delete(g.versions, kind)
		return
	}
	g.sessions[kind] = id
}

// requestMethod is the JSON-RPC method of the request ("" when unreadable).
func requestMethod(body []byte) string {
	var envelope struct {
		Method string `json:"method"`
	}
	_ = json.Unmarshal(body, &envelope)
	return envelope.Method
}

// requestID is the id of the JSON-RPC request, as raw JSON ("" for a notification or an unreadable body).
func requestID(body []byte) string {
	var envelope struct {
		ID json.RawMessage `json:"id"`
	}
	if json.Unmarshal(body, &envelope) != nil {
		return ""
	}
	return strings.TrimSpace(string(envelope.ID))
}

// messageFromEventStream reads server-sent events until the JSON-RPC answer to the request arrives. Other messages the vendor sends on
// the stream (progress, logging) are skipped: the runtime's plain transport has nowhere to put them.
func messageFromEventStream(stream io.Reader, id string) ([]byte, error) {
	scanner := bufio.NewScanner(io.LimitReader(stream, maxBody))
	scanner.Buffer(make([]byte, 64<<10), maxBody)
	var data []string
	var fallback []byte

	flush := func() []byte {
		if len(data) == 0 {
			return nil
		}
		payload := []byte(strings.Join(data, "\n"))
		data = nil
		var message struct {
			ID     json.RawMessage `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  json.RawMessage `json:"error"`
		}
		if json.Unmarshal(payload, &message) != nil || (message.Result == nil && message.Error == nil) {
			return nil
		}
		if id == "" || strings.TrimSpace(string(message.ID)) == id {
			return payload
		}
		if fallback == nil {
			fallback = payload
		}
		return nil
	}

	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case line == "":
			if message := flush(); message != nil {
				return message, nil
			}
		case strings.HasPrefix(line, "data:"):
			data = append(data, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
	}
	if message := flush(); message != nil {
		return message, nil
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("reading the vendor's event stream: %w", err)
	}
	if fallback != nil {
		return fallback, nil
	}
	return nil, errors.New("the vendor's event stream ended without an answer")
}
