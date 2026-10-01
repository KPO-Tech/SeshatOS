// sseProtocolVersion identifies the SSE framing contract between the server
// and any client (desktop UI, CLI, third-party integrations).
//
// # SSE framing contract v1
//
// Streaming chunks (model tokens):
//
//	data: <APIResponseChunk JSON>\n\n
//
// Runtime events (tool calls, permissions, progress):
//
//	event: runtime\ndata: <RuntimeEvent JSON>\n\n
//
// Final result (turn complete):
//
//	event: done\ndata: <queryResponse JSON>\n\n
//
// Error:
//
//	event: error\ndata: {"error":"<message>"}\n\n
//
// Keep-alive (no-op, prevents proxy timeouts):
//
//	: keepalive\n\n
//
// Clients MUST check the X-SSE-Version response header before parsing.
// Bump this and update all clients whenever the framing changes.

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/KPO-Tech/seshat/pkg/types"
)

const sseProtocolVersion = "1"

func buildToolResultSSE(uses []types.ToolUseContent, results []CallResult) []toolResultSSE {
	if len(uses) == 0 {
		return nil
	}
	out := make([]toolResultSSE, len(uses))
	for i, tu := range uses {
		out[i] = toolResultSSE{ToolUseID: tu.ID}
		if i < len(results) {
			tr := results[i]
			out[i].Content = tr.Content
			out[i].IsError = tr.Error != nil
			if tr.Metadata != nil {
				out[i].DurationMs = tr.Metadata.ExecutionDuration
				if len(tr.Metadata.Additional) > 0 || tr.Metadata.ContentReplacement != nil || tr.Metadata.ExecutionDuration > 0 {
					metadata := map[string]any{}
					if tr.Metadata.ExecutionDuration > 0 {
						metadata["execution_duration_ms"] = tr.Metadata.ExecutionDuration
					}
					if tr.Metadata.ContentReplacement != nil {
						metadata["content_replacement"] = tr.Metadata.ContentReplacement
					}
					for key, value := range tr.Metadata.Additional {
						metadata[key] = value
					}
					out[i].Metadata = metadata
				}
			}
		}
	}
	return out
}

func writeSSEError(w http.ResponseWriter, flusher http.Flusher, mu *sync.Mutex, msg string) {
	data, _ := json.Marshal(map[string]string{"error": msg})
	if mu != nil {
		mu.Lock()
		defer mu.Unlock()
	}
	fmt.Fprintf(w, "event: error\ndata: %s\n\n", data)
	flusher.Flush()
}

func buildToolPermissionDescription(toolName string, toolInput map[string]any, metadata map[string]any) string {
	switch toolName {
	case "bash":
		if command, _ := toolInput["command"].(string); strings.TrimSpace(command) != "" {
			if workingDir, _ := metadata["working_directory"].(string); strings.TrimSpace(workingDir) != "" {
				return fmt.Sprintf("Execute shell command in %s: %s", workingDir, command)
			}
			return fmt.Sprintf("Execute shell command: %s", command)
		}
	case "web_fetch":
		if url, _ := toolInput["url"].(string); strings.TrimSpace(url) != "" {
			return fmt.Sprintf("Fetch remote URL: %s", url)
		}
	case "web_search":
		if query, _ := toolInput["query"].(string); strings.TrimSpace(query) != "" {
			return fmt.Sprintf("Run web search for query: %s", query)
		}
	}
	if workingDir, _ := metadata["working_directory"].(string); strings.TrimSpace(workingDir) != "" {
		return fmt.Sprintf("Allow tool %s to run in %s.", toolName, workingDir)
	}
	return fmt.Sprintf("Allow tool %s to run.", toolName)
}
