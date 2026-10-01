package api

import (
	"context"
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
	"github.com/KPO-Tech/seshat/pkg/contract"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	"github.com/KPO-Tech/seshat/pkg/types"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// Type aliases kept for readability in handler signatures.
type queryRunner = query.QueryRuntime
type streamingQueryRunner = query.StreamingQueryRuntime
type queryExecutionResult = query.QueryResult
type CallResult = contract.CallResult

type queryRequest struct {
	Prompt             string   `json:"prompt"`
	SessionID          string   `json:"session_id,omitempty"`
	ProviderSettingID  string   `json:"provider_setting_id,omitempty"`
	ModelID            string   `json:"model_id,omitempty"`
	PermissionMode     string   `json:"permission_mode,omitempty"`
	ExecutionOrigin    string   `json:"execution_origin,omitempty"`
	CorpusID           string   `json:"corpus_id,omitempty"`
	FileIDs            []string `json:"file_ids,omitempty"`
	AppendSystemPrompt *string  `json:"append_system_prompt,omitempty"`
	// AgentSlug identifies an agent profile to run as. When set, the agent's
	// system prompt, model, and permission mode are applied to the session.
	AgentSlug string `json:"agent_slug,omitempty"`
}

type createSessionRequest struct {
	ProviderSettingID string `json:"provider_setting_id,omitempty"`
	ModelID           string `json:"model_id,omitempty"`
	PermissionMode    string `json:"permission_mode,omitempty"`
	ExecutionOrigin   string `json:"execution_origin,omitempty"`
	// Source is a UI-only hint ("knowledge" for sessions created by the
	// Knowledge search page) - see query.Service.CreateSession.
	Source string `json:"source,omitempty"`
}

type updateSessionRequest struct {
	Title             *string `json:"title,omitempty"`
	PermissionMode    *string `json:"permission_mode,omitempty"`
	ExecutionOrigin   *string `json:"execution_origin,omitempty"`
	ProviderSettingID *string `json:"provider_setting_id,omitempty"`
	ModelID           *string `json:"model_id,omitempty"`
	WorkspacePath     *string `json:"workspace_path,omitempty"`
	ProjectPath       *string `json:"project_path,omitempty"`
	// ExecutionMode force-sets ("plan"/"execute") or clears ("") the host
	// override applied to the SDK session ahead of its next turn — see
	// Session.ForcePlanMode()/ClearPlanMode() in seshat-backend/internal/query/runtime.go.
	ExecutionMode *string `json:"execution_mode,omitempty"`
}

type queryResponse struct {
	SessionID   string                  `json:"session_id"`
	Content     string                  `json:"content"`
	StopReason  string                  `json:"stop_reason"`
	TurnNumber  int                     `json:"turn_number"`
	IsComplete  bool                    `json:"is_complete"`
	Usage       *types.TokenUsage       `json:"usage,omitempty"`
	ToolUses    []types.ToolUseContent  `json:"tool_uses,omitempty"`
	ToolResults []toolResultSSE         `json:"tool_results,omitempty"`
	Messages    []json.RawMessage       `json:"messages,omitempty"`
	RAGResults  []query.RAGSearchResult `json:"rag_results,omitempty"`
}

// toolResultSSE carries the result of one tool call in the SSE done event.
type toolResultSSE struct {
	ToolUseID  string         `json:"id"`
	Content    string         `json:"content"`
	IsError    bool           `json:"is_error,omitempty"`
	DurationMs int64          `json:"duration_ms,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

type sessionSearchResult struct {
	SessionID string `json:"session_id"`
	Title     string `json:"title"`
	Preview   string `json:"preview,omitempty"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

func (app *App) handleQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req queryRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		writeJSONError(w, http.StatusBadRequest, "prompt is required")
		return
	}
	if len(req.Prompt) > 131072 {
		writeJSONError(w, http.StatusBadRequest, "prompt exceeds maximum length (128 KiB)")
		return
	}

	principal, _ := authPrincipalFromContext(r.Context())
	permissionMode, executionOrigin, err := app.backend.Query.ResolvePolicyFromRequest(r.Context(), principal, req.SessionID, req.PermissionMode, req.ExecutionOrigin)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	queryInput, ragResults := app.backend.Query.BuildContextInput(r.Context(), query.ContextBuildParams{
		Prompt:             req.Prompt,
		SessionID:          req.SessionID,
		ProviderSettingID:  req.ProviderSettingID,
		ModelID:            req.ModelID,
		PermissionMode:     permissionMode,
		ExecutionOrigin:    executionOrigin,
		CorpusID:           req.CorpusID,
		FileIDs:            req.FileIDs,
		AppendSystemPrompt: req.AppendSystemPrompt,
		AgentSlug:          req.AgentSlug,
		Principal:          principal,
	})
	queryCtx := app.enrichContextWithAgentPrefs(r.Context(), principal)
	queryCtx, span := otel.Tracer("seshat").Start(queryCtx, "query.run",
		trace.WithSpanKind(trace.SpanKindServer),
		trace.WithAttributes(
			attribute.String("session.id", queryInput.SessionID),
			attribute.String("user.id", func() string {
				if principal != nil {
					return principal.User.ID
				}
				return ""
			}()),
		),
	)
	defer span.End()

	result, err := app.backend.Query.RunPrompt(queryCtx, principal, queryInput)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		writeBackendError(w, err)
		return
	}
	span.SetStatus(codes.Ok, "")
	span.SetAttributes(
		attribute.String("stop_reason", result.StopReason),
		attribute.Int("turn_number", result.TurnNumber),
	)

	// Async long-term memory extraction — best-effort, never blocks the response.
	app.triggerMemoryExtraction(principal, result)

	if principal != nil {
		app.backend.Quota.Increment(r.Context(), principal, backendquotas.MetricQueries, 1)
	}
	writeJSON(w, http.StatusOK, queryResponse{
		SessionID:   result.SessionID,
		Content:     result.Content,
		StopReason:  result.StopReason,
		TurnNumber:  result.TurnNumber,
		IsComplete:  result.IsComplete,
		Usage:       result.Usage,
		ToolUses:    result.ToolUses,
		ToolResults: buildToolResultSSE(result.ToolUses, result.ToolResults),
		Messages:    decorateMessagesWithAttachments(r.Context(), app.backend.Files, result.SessionID, result.Messages),
		RAGResults:  ragResults,
	})
}

// handleQueryStream handles POST /api/v1/query/stream.
// It runs the query and delivers each streaming chunk as a Server-Sent Event,
// followed by a final "done" event carrying the full result JSON.
//
// SSE format:
//
//	data: {<types.APIResponseChunk JSON>}\n\n
//	event: runtime\ndata: {<sdk.RuntimeEvent JSON>}\n\n
//	event: done\ndata: {<queryResponse JSON>}\n\n
//	event: error\ndata: {"error":"..."}\n\n   (on failure)
func (app *App) handleQueryStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, "streaming not supported by transport")
		return
	}

	var req queryRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		writeJSONError(w, http.StatusBadRequest, "prompt is required")
		return
	}
	if len(req.Prompt) > 131072 {
		writeJSONError(w, http.StatusBadRequest, "prompt exceeds maximum length (128 KiB)")
		return
	}
	if !app.backend.Query.SupportsStreaming() {
		writeJSONError(w, http.StatusNotImplemented, "streaming not supported by this runtime")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-SSE-Version", sseProtocolVersion)
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	var writeMu sync.Mutex
	// streamClosed is flipped once handleQueryStream returns (see defer below).
	// Some tools (e.g. spawn_agent) capture the RuntimeEventEmitterKey closure
	// and call it from a detached goroutine that can outlive this request —
	// notably when the model never calls wait_agent/close_agent before its turn
	// ends. Without this guard, that late call would write directly to a
	// ResponseWriter/connection the net/http server may have already recycled
	// for another request, which is undefined behavior per the http.Handler
	// contract. Once closed, late events are dropped rather than delivered late.
	streamClosed := false
	writeSSE := func(event string, payload []byte) {
		writeMu.Lock()
		defer writeMu.Unlock()
		if streamClosed {
			return
		}
		if event != "" {
			fmt.Fprintf(w, "event: %s\n", event)
		}
		fmt.Fprintf(w, "data: %s\n\n", payload)
		flusher.Flush()
	}
	writeSSEComment := func(comment string) {
		writeMu.Lock()
		defer writeMu.Unlock()
		if streamClosed {
			return
		}
		fmt.Fprintf(w, ": %s\n\n", comment)
		flusher.Flush()
	}
	defer func() {
		writeMu.Lock()
		streamClosed = true
		writeMu.Unlock()
	}()

	keepAliveDone := make(chan struct{})
	defer close(keepAliveDone)
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-keepAliveDone:
				return
			case <-r.Context().Done():
				return
			case <-ticker.C:
				writeSSEComment("keepalive")
			}
		}
	}()

	onChunk := func(chunk sdk.ResponseChunk) {
		data, err := json.Marshal(chunk)
		if err != nil {
			return
		}
		writeSSE("", data)
	}

	onRuntimeEvent := func(event sdk.RuntimeEvent) {
		data, err := json.Marshal(event)
		if err != nil {
			return
		}
		writeSSE("runtime", data)
	}

	principal, _ := authPrincipalFromContext(r.Context())
	principalUserID := ""
	if principal != nil {
		principalUserID = principal.User.ID
	}
	streamSessionID := strings.TrimSpace(req.SessionID)

	// Build per-request permission promptFn that bridges tool approval to SSE clients.
	promptFn := types.PromptFn(func(ctx context.Context, req types.PromptRequest) (types.PromptResponse, error) {
		if req.Type != types.PromptTypeConfirm {
			promptID, _ := req.Metadata["prompt_id"].(string)
			if promptID == "" {
				promptID = fmt.Sprintf("prompt-%d", time.Now().UnixNano())
			}

			metadata := make(map[string]any, len(req.Metadata)+1)
			for key, value := range req.Metadata {
				metadata[key] = value
			}
			metadata["prompt_id"] = promptID
			if _, ok := metadata["tool_name"]; !ok {
				metadata["tool_name"] = "ask_user_question"
			}

			onRuntimeEvent(sdk.RuntimeEvent{
				Type: types.RuntimeEventTypePromptRequired,
				PromptRequest: &types.PromptRequest{
					Type:     req.Type,
					Message:  req.Message,
					Options:  req.Options,
					Default:  req.Default,
					Metadata: metadata,
				},
			})

			ch := app.promptBroker.Await(promptID, principalUserID, streamSessionID)
			defer app.promptBroker.Cancel(promptID)

			select {
			case response := <-ch:
				return response, nil
			case <-ctx.Done():
				return types.PromptResponse{Cancelled: true}, nil
			}
		}

		toolName, _ := req.Metadata["tool_name"].(string)
		toolInput, _ := req.Metadata["tool_input"].(map[string]any)
		toolUseID, _ := req.Metadata["tool_use_id"].(string)
		if toolUseID == "" {
			toolUseID = fmt.Sprintf("perm-%s-%d", toolName, time.Now().UnixNano())
		}

		onRuntimeEvent(sdk.RuntimeEvent{
			Type: types.RuntimeEventTypeToolPermissionRequired,
			PermissionRequest: &types.ToolPermissionRequest{
				ToolUseID:   toolUseID,
				ToolName:    toolName,
				Description: buildToolPermissionDescription(toolName, toolInput, req.Metadata),
				ToolInput:   toolInput,
			},
		})

		ch := app.permBroker.Await(toolUseID, principalUserID, streamSessionID)
		defer app.permBroker.Cancel(toolUseID)

		select {
		case decision := <-ch:
			// The permission Integrator's ResolverWithContext only persists a
			// session-scoped approval when Value is literally the string
			// "always" (internal/permissions/integration.go) - a plain `true`
			// only resolves this one pending call. Remember (from "Always
			// Allow" in the UI, see broker.go's PermissionDecision) is what
			// picks between them.
			var value any = decision.Approved
			if decision.Approved && decision.Remember {
				value = "always"
			}
			response := types.PromptResponse{Value: value}
			if !decision.Approved && decision.Reason != "" {
				response.Metadata = map[string]any{"reason": decision.Reason}
			}
			return response, nil
		case <-ctx.Done():
			return types.PromptResponse{Cancelled: true}, nil
		}
	})

	permMode, executionOrigin, err := app.backend.Query.ResolvePolicyFromRequest(r.Context(), principal, req.SessionID, req.PermissionMode, req.ExecutionOrigin)
	if err != nil {
		writeSSEError(w, flusher, &writeMu, err.Error())
		return
	}

	streamInput, ragResults := app.backend.Query.BuildContextInput(r.Context(), query.ContextBuildParams{
		Prompt:             req.Prompt,
		SessionID:          req.SessionID,
		ProviderSettingID:  req.ProviderSettingID,
		ModelID:            req.ModelID,
		PermissionMode:     permMode,
		ExecutionOrigin:    executionOrigin,
		PromptFn:           promptFn,
		CorpusID:           req.CorpusID,
		FileIDs:            req.FileIDs,
		AppendSystemPrompt: req.AppendSystemPrompt,
		AgentSlug:          req.AgentSlug,
		Principal:          principal,
		OnStage: func(stage, label string) {
			onRuntimeEvent(sdk.RuntimeEvent{
				Type:       sdk.RuntimeEventTypeStage,
				SessionID:  sdk.SessionID(req.SessionID),
				StageEvent: &sdk.StageRuntimeEvent{Stage: stage, Label: label},
			})
		},
	})
	if app.titleBroker != nil {
		titleCh, unsubscribeTitle := app.titleBroker.Subscribe(streamInput.SessionID)
		defer unsubscribeTitle()
		titleRelayDone := make(chan struct{})
		defer close(titleRelayDone)
		go func() {
			for {
				select {
				case title, ok := <-titleCh:
					if !ok {
						return
					}
					data, err := json.Marshal(map[string]string{
						"session_id": streamInput.SessionID,
						"title":      title,
					})
					if err == nil {
						writeSSE("session_titled", data)
					}
				case <-titleRelayDone:
					return
				case <-r.Context().Done():
					return
				}
			}
		}()
	}
	if title, err := app.backend.Query.EnsureInitialSessionTitle(r.Context(), principal, streamInput.SessionID, req.Prompt); err == nil && title != "" {
		data, err := json.Marshal(map[string]string{
			"session_id": streamInput.SessionID,
			"title":      title,
		})
		if err == nil {
			writeSSE("session_titled", data)
		}
	}
	// Inject the event emitter and the user's sub-agent depth preference.
	baseCtx := app.enrichContextWithAgentPrefs(r.Context(), principal)
	streamCtx, streamSpan := otel.Tracer("seshat").Start(baseCtx, "query.stream",
		trace.WithSpanKind(trace.SpanKindServer),
		trace.WithAttributes(
			attribute.String("session.id", streamInput.SessionID),
			attribute.String("user.id", principalUserID),
		),
	)
	defer streamSpan.End()

	enrichedCtx := context.WithValue(
		streamCtx,
		types.RuntimeEventEmitterKey, func(event types.RuntimeEvent) { onRuntimeEvent(event) },
	)
	result, err := app.backend.Query.StreamPrompt(enrichedCtx, principal, streamInput, onChunk, onRuntimeEvent)
	if err != nil {
		if bkerr.KindOf(err) == bkerr.ErrorKindUnavailable && bkerr.Message(err) == "streaming not supported by this runtime" {
			writeJSONError(w, http.StatusNotImplemented, bkerr.Message(err))
			return
		}
		// If the request context was cancelled (browser closed/navigated), no point sending an error event.
		if r.Context().Err() != nil {
			streamSpan.SetStatus(codes.Ok, "cancelled")
			return
		}
		streamSpan.RecordError(err)
		streamSpan.SetStatus(codes.Error, bkerr.Message(err))
		writeSSEError(w, flusher, &writeMu, bkerr.Message(err))
		return
	}
	streamSpan.SetStatus(codes.Ok, "")
	streamSpan.SetAttributes(
		attribute.String("stop_reason", result.StopReason),
		attribute.Int("turn_number", result.TurnNumber),
	)

	// Async long-term memory extraction — best-effort, never blocks the response.
	app.triggerMemoryExtraction(principal, result)

	if principal != nil {
		app.backend.Quota.Increment(r.Context(), principal, backendquotas.MetricQueries, 1)
	}
	finalData, marshalErr := json.Marshal(queryResponse{
		SessionID:   result.SessionID,
		Content:     result.Content,
		StopReason:  result.StopReason,
		TurnNumber:  result.TurnNumber,
		IsComplete:  result.IsComplete,
		Usage:       result.Usage,
		ToolUses:    result.ToolUses,
		ToolResults: buildToolResultSSE(result.ToolUses, result.ToolResults),
		Messages:    decorateMessagesWithAttachments(r.Context(), app.backend.Files, result.SessionID, result.Messages),
		RAGResults:  ragResults,
	})
	if marshalErr != nil {
		writeSSEError(w, flusher, &writeMu, "failed to serialize result")
		return
	}
	writeSSE("done", finalData)
}

// triggerMemoryExtraction fires async entity extraction from the conversation
// messages when the extractor is configured. Errors are swallowed — extraction
// is best-effort and must never affect the user-facing response.
func (app *App) triggerMemoryExtraction(principal *backendauth.Principal, result *query.QueryResult) {
	if app.longTermExtractor == nil || principal == nil || result == nil || len(result.Messages) == 0 {
		return
	}
	userID := principal.User.ID
	msgs := result.Messages
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		_ = app.longTermExtractor.Extract(ctx, userID, msgs)
	}()
}
