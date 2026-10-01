package api

// Anthropic Messages API compatible endpoint.
//
// POST /v1/messages
//
// Clients configure their Anthropic SDK base URL:
//
//	ANTHROPIC_BASE_URL=http://localhost:8080/v1      (Claude Code, Python/TS SDK)
//
// Auth: x-api-key: <seshat-api-key>  OR  Authorization: Bearer <seshat-jwt>
//
// Seshat extension headers (all optional):
//
//	x-seshat-session-id           bind to an existing session for multi-turn continuity
//	x-seshat-provider-setting-id  override the provider/model config to use
//
// The full Seshat agent loop executes server-side (tools, permissions, memory).
// The client receives the final assistant message in Anthropic format.
// No client-side tool execution is expected.

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/query"
	backendquotas "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/quotas"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	"github.com/KPO-Tech/seshat/pkg/types"
)

// ─── Request types ────────────────────────────────────────────────────────────

type anthropicMessagesRequest struct {
	Model     string               `json:"model"`
	MaxTokens int                  `json:"max_tokens,omitempty"`
	Messages  []anthropicInMessage `json:"messages"`
	System    string               `json:"system,omitempty"`
	Stream    bool                 `json:"stream"`
}

type anthropicInMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"` // string or []map[string]any
}

// ─── Response types (non-streaming) ──────────────────────────────────────────

type anthropicUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type anthropicOutContentBlock struct {
	Type string `json:"type"` // "text"
	Text string `json:"text"`
}

type anthropicOutMessage struct {
	ID           string                     `json:"id"`
	Type         string                     `json:"type"` // "message"
	Role         string                     `json:"role"` // "assistant"
	Content      []anthropicOutContentBlock `json:"content"`
	Model        string                     `json:"model"`
	StopReason   string                     `json:"stop_reason"`
	StopSequence *string                    `json:"stop_sequence"`
	Usage        anthropicUsage             `json:"usage"`
}

// ─── Input extraction helpers ─────────────────────────────────────────────────

// extractAnthropicInputs returns (lastUserPrompt, systemAppend) from the request.
// lastUserPrompt is the text of the final "user" message.
// systemAppend merges the Anthropic "system" field into a seshat append block.
func extractAnthropicInputs(req anthropicMessagesRequest) (prompt, systemAppend string) {
	// Walk messages in reverse to find the last user message.
	for i := len(req.Messages) - 1; i >= 0; i-- {
		msg := req.Messages[i]
		if msg.Role != "user" {
			continue
		}
		text := extractAnthropicText(msg.Content)
		if strings.TrimSpace(text) != "" {
			prompt = text
			break
		}
	}
	systemAppend = strings.TrimSpace(req.System)
	return
}

// extractAnthropicText converts an Anthropic content field (string or []block)
// into a plain string. Images and non-text blocks are silently skipped.
func extractAnthropicText(content any) string {
	switch v := content.(type) {
	case string:
		return v
	case []any:
		var b strings.Builder
		for _, raw := range v {
			block, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			if block["type"] == "text" {
				if t, ok := block["text"].(string); ok {
					b.WriteString(t)
				}
			}
		}
		return b.String()
	}
	return ""
}

// ─── ID generation ────────────────────────────────────────────────────────────

func newAnthropicMessageID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return fmt.Sprintf("msg_%x", b)
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

// anthropicAuthMiddleware accepts both the Anthropic-native x-api-key header
// and the standard Authorization: Bearer header used by the rest of the API.
func (app *App) anthropicAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := ""

		// 1. x-api-key header (Anthropic SDK default)
		if k := strings.TrimSpace(r.Header.Get("x-api-key")); k != "" {
			token = k
		}

		// 2. Authorization: Bearer fallback (seshat-ui, curl, etc.)
		if token == "" {
			hdr := strings.TrimSpace(r.Header.Get("Authorization"))
			if strings.HasPrefix(hdr, "Bearer ") {
				token = strings.TrimSpace(strings.TrimPrefix(hdr, "Bearer "))
			}
		}

		if token == "" {
			writeJSONError(w, http.StatusUnauthorized, "missing api key — set x-api-key or Authorization: Bearer")
			return
		}

		var (
			principal *backendauth.Principal
			err       error
		)
		if strings.HasPrefix(token, "sk-") {
			principal, err = app.backend.Auth.ResolveAPIKeyPrincipal(r.Context(), token)
		} else {
			principal, err = app.backend.Auth.ResolvePrincipal(r.Context(), token)
		}
		if err != nil {
			writeBackendError(w, err)
			return
		}

		if app.rateLimiter != nil && !app.rateLimiter.Allow(principal.User.ID) {
			writeJSONError(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}

		ctx := context.WithValue(r.Context(), authPrincipalContextKey, principal)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ─── Main handler ─────────────────────────────────────────────────────────────

// handleMessages handles POST /v1/messages.
func (app *App) handleMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req anthropicMessagesRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}

	prompt, systemAppend := extractAnthropicInputs(req)
	if strings.TrimSpace(prompt) == "" {
		writeAnthropicError(w, http.StatusBadRequest, "invalid_request_error",
			"messages must contain at least one user message with non-empty text content")
		return
	}
	if len(prompt) > 131072 {
		writeAnthropicError(w, http.StatusBadRequest, "invalid_request_error",
			"prompt exceeds maximum length (128 KiB)")
		return
	}

	// Seshat extension headers.
	sessionID := strings.TrimSpace(r.Header.Get("x-seshat-session-id"))
	providerSettingID := strings.TrimSpace(r.Header.Get("x-seshat-provider-setting-id"))

	principal, _ := authPrincipalFromContext(r.Context())
	permMode, execOrigin, err := app.backend.Query.ResolvePolicyFromRequest(r.Context(), principal, sessionID, "", "")
	if err != nil {
		writeAnthropicError(w, http.StatusBadRequest, "invalid_request_error", err.Error())
		return
	}

	queryInput := query.QueryInput{
		Prompt:            prompt,
		SessionID:         sessionID,
		ProviderSettingID: providerSettingID,
		ModelID:           strings.TrimSpace(req.Model),
		PermissionMode:    permMode,
		ExecutionOrigin:   execOrigin,
	}
	if systemAppend != "" {
		queryInput.AppendSystemPrompt = &systemAppend
	}
	messageID := newAnthropicMessageID()

	if req.Stream {
		app.handleMessagesStream(w, r, req, queryInput, messageID, principal)
	} else {
		app.handleMessagesSync(w, r, req, queryInput, messageID, principal)
	}
}

// ─── Synchronous path ─────────────────────────────────────────────────────────

func (app *App) handleMessagesSync(
	w http.ResponseWriter,
	r *http.Request,
	req anthropicMessagesRequest,
	queryInput query.QueryInput,
	messageID string,
	principal *backendauth.Principal,
) {
	result, err := app.backend.Query.RunPrompt(r.Context(), principal, queryInput)
	if err != nil {
		writeAnthropicError(w, http.StatusInternalServerError, "api_error", bkerr.Message(err))
		return
	}

	app.triggerMemoryExtraction(principal, result)
	if principal != nil {
		app.backend.Quota.Increment(r.Context(), principal, backendquotas.MetricQueries, 1)
	}

	usage := anthropicUsage{}
	if result.Usage != nil {
		usage.InputTokens = result.Usage.InputTokens
		usage.OutputTokens = result.Usage.OutputTokens
	}

	content := []anthropicOutContentBlock{}
	if strings.TrimSpace(result.Content) != "" {
		content = append(content, anthropicOutContentBlock{
			Type: "text",
			Text: result.Content,
		})
	}

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "seshat"
	}

	writeJSON(w, http.StatusOK, anthropicOutMessage{
		ID:         messageID,
		Type:       "message",
		Role:       "assistant",
		Content:    content,
		Model:      model,
		StopReason: normalizeStopReason(result.StopReason),
		Usage:      usage,
	})
}

// ─── Streaming path ───────────────────────────────────────────────────────────

func (app *App) handleMessagesStream(
	w http.ResponseWriter,
	r *http.Request,
	req anthropicMessagesRequest,
	queryInput query.QueryInput,
	messageID string,
	principal *backendauth.Principal,
) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeAnthropicError(w, http.StatusInternalServerError, "api_error", "streaming not supported by transport")
		return
	}
	if !app.backend.Query.SupportsStreaming() {
		writeAnthropicError(w, http.StatusNotImplemented, "api_error", "streaming not supported by this runtime")
		return
	}

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "seshat"
	}

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	var mu sync.Mutex
	emit := func(et anthropicEventType, payload any) {
		writeAnthropicEvent(w, flusher, &mu, et, payload)
	}

	// message_start
	emit(anthropicEventMessageStart, anthropicSSEMessageStart{
		Type: "message_start",
		Message: anthropicSSEMessage{
			ID:           messageID,
			Type:         "message",
			Role:         "assistant",
			Content:      []any{},
			Model:        model,
			StopReason:   nil,
			StopSequence: nil,
			Usage:        anthropicUsage{InputTokens: 0, OutputTokens: 0},
		},
	})

	// content_block_start (text block at index 0)
	emit(anthropicEventContentBlockStart, anthropicSSEContentBlockStart{
		Type:         "content_block_start",
		Index:        0,
		ContentBlock: anthropicSSEContentBlock{Type: "text", Text: ""},
	})

	// ping
	emit(anthropicEventPing, anthropicSSEPing{Type: "ping"})

	// Keepalive goroutine — prevents proxy timeouts during long agent loops.
	keepaliveDone := make(chan struct{})
	defer close(keepaliveDone)
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-keepaliveDone:
				return
			case <-r.Context().Done():
				return
			case <-ticker.C:
				mu.Lock()
				fmt.Fprintf(w, ": keepalive\n\n")
				flusher.Flush()
				mu.Unlock()
			}
		}
	}()

	// Stream text deltas from the Seshat engine.
	onChunk := func(chunk sdk.ResponseChunk) {
		if chunk.Delta == "" {
			return
		}
		emit(anthropicEventContentBlockDelta, anthropicSSEContentBlockDelta{
			Type:  "content_block_delta",
			Index: 0,
			Delta: anthropicSSEDelta{Type: "text_delta", Text: chunk.Delta},
		})
	}

	// Runtime events (tool progress, permissions) are silently consumed —
	// Anthropic protocol has no equivalent for server-side tool execution events.
	onRuntimeEvent := func(_ sdk.RuntimeEvent) {}

	enrichedCtx := context.WithValue(
		app.enrichContextWithAgentPrefs(r.Context(), principal),
		types.RuntimeEventEmitterKey, func(event types.RuntimeEvent) { onRuntimeEvent(event) },
	)
	queryInput.PromptFn = nil // no interactive prompts in compat mode

	result, err := app.backend.Query.StreamPrompt(enrichedCtx, principal, queryInput, onChunk, onRuntimeEvent)

	// content_block_stop
	emit(anthropicEventContentBlockStop, anthropicSSEContentBlockStop{
		Type:  "content_block_stop",
		Index: 0,
	})

	if err != nil {
		if r.Context().Err() == nil {
			// Emit error as a message_delta with stop_reason="error" so SDK clients
			// don't hang waiting for message_stop.
			emit(anthropicEventMessageDelta, anthropicSSEMessageDelta{
				Type:  "message_delta",
				Delta: anthropicSSEMessageDeltaV{StopReason: "error"},
				Usage: anthropicOutputUsage{OutputTokens: 0},
			})
			emit(anthropicEventMessageStop, anthropicSSEMessageStop{Type: "message_stop"})
		}
		return
	}

	app.triggerMemoryExtraction(principal, result)
	if principal != nil {
		app.backend.Quota.Increment(r.Context(), principal, backendquotas.MetricQueries, 1)
	}

	outputTokens := 0
	inputTokens := 0
	if result.Usage != nil {
		outputTokens = result.Usage.OutputTokens
		inputTokens = result.Usage.InputTokens
	}

	// Patch message_start usage now that we have real counts.
	// This is sent as a separate event so SDK clients that already processed
	// message_start still get accurate billing data.
	if inputTokens > 0 {
		emit(anthropicEventMessageDelta, anthropicSSEMessageDelta{
			Type: "message_delta",
			Delta: anthropicSSEMessageDeltaV{
				StopReason:   normalizeStopReason(result.StopReason),
				StopSequence: nil,
			},
			Usage: anthropicOutputUsage{OutputTokens: outputTokens},
		})
	} else {
		emit(anthropicEventMessageDelta, anthropicSSEMessageDelta{
			Type: "message_delta",
			Delta: anthropicSSEMessageDeltaV{
				StopReason:   normalizeStopReason(result.StopReason),
				StopSequence: nil,
			},
			Usage: anthropicOutputUsage{OutputTokens: outputTokens},
		})
	}

	emit(anthropicEventMessageStop, anthropicSSEMessageStop{Type: "message_stop"})
}

// ─── Error helpers ────────────────────────────────────────────────────────────

type anthropicErrorEnvelope struct {
	Type  string         `json:"type"` // "error"
	Error anthropicError `json:"error"`
}

type anthropicError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

func writeAnthropicError(w http.ResponseWriter, status int, errType, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(anthropicErrorEnvelope{
		Type:  "error",
		Error: anthropicError{Type: errType, Message: message},
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// normalizeStopReason maps Seshat stop reasons to Anthropic stop_reason values.
func normalizeStopReason(reason string) string {
	switch reason {
	case "end_turn", "stop_sequence", "max_tokens", "tool_use":
		return reason
	case "stop", "length", "": // OpenAI-style or empty
		if reason == "length" {
			return "max_tokens"
		}
		return "end_turn"
	default:
		return "end_turn"
	}
}
