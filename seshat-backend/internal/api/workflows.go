package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/workflows"
)

type workflowRunRequest struct {
	// Definition is the workflow YAML or JSON text, as produced by seshat-ui's
	// Workflows designer page.
	Definition        string `json:"definition"`
	ProviderSettingID string `json:"provider_setting_id,omitempty"`
	MaxParallel       int    `json:"max_parallel,omitempty"`
}

// handleWorkflowRun streams one SSE "node" event per completed workflow node
// (see internal/workflows.NodeEvent), followed by a single "done" event with
// the aggregate result, or an "error" event if validation/setup fails before
// any node runs. Follows the same SSE framing contract as handleQueryStream
// (see query_sse.go's doc comment) - X-SSE-Version, data:/event: framing,
// periodic keepalive comments.
func (app *App) handleWorkflowRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, "streaming not supported by transport")
		return
	}

	var req workflowRunRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Definition) == "" {
		writeJSONError(w, http.StatusBadRequest, "definition is required")
		return
	}

	def, err := workflows.ParseDefinition(req.Definition)
	if err != nil {
		writeBackendError(w, err)
		return
	}

	principal, _ := authPrincipalFromContext(r.Context())

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-SSE-Version", sseProtocolVersion)
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	var writeMu sync.Mutex
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
				writeMu.Lock()
				if !streamClosed {
					fmt.Fprintf(w, ": keepalive\n\n")
					flusher.Flush()
				}
				writeMu.Unlock()
			}
		}
	}()

	onNode := func(evt workflows.NodeEvent) {
		data, marshalErr := json.Marshal(evt)
		if marshalErr != nil {
			return
		}
		writeSSE("node", data)
	}

	result, err := app.backend.Workflows.Run(r.Context(), principal, def, workflows.RunParams{
		ProviderSettingID: req.ProviderSettingID,
		MaxParallel:       req.MaxParallel,
	}, onNode)
	if err != nil {
		data, _ := json.Marshal(map[string]string{"error": err.Error()})
		writeSSE("error", data)
		return
	}

	data, _ := json.Marshal(result)
	writeSSE("done", data)
}
