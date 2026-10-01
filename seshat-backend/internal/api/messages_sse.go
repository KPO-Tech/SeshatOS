package api

// Anthropic Messages API SSE event format.
//
// Streaming protocol (subset used by Seshat — text-only, server-side tool execution):
//
//	event: message_start
//	data: {"type":"message_start","message":{...}}
//
//	event: content_block_start
//	data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}
//
//	event: ping
//	data: {"type":"ping"}
//
//	event: content_block_delta
//	data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
//
//	event: content_block_stop
//	data: {"type":"content_block_stop","index":0}
//
//	event: message_delta
//	data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":N}}
//
//	event: message_stop
//	data: {"type":"message_stop"}
//
// Reference: https://docs.anthropic.com/en/api/messages-streaming

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

type anthropicEventType string

const (
	anthropicEventMessageStart      anthropicEventType = "message_start"
	anthropicEventContentBlockStart anthropicEventType = "content_block_start"
	anthropicEventPing              anthropicEventType = "ping"
	anthropicEventContentBlockDelta anthropicEventType = "content_block_delta"
	anthropicEventContentBlockStop  anthropicEventType = "content_block_stop"
	anthropicEventMessageDelta      anthropicEventType = "message_delta"
	anthropicEventMessageStop       anthropicEventType = "message_stop"
)

// writeAnthropicEvent writes a single Anthropic SSE frame.
// Thread-safe when mu is provided.
func writeAnthropicEvent(w http.ResponseWriter, f http.Flusher, mu *sync.Mutex, eventType anthropicEventType, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	if mu != nil {
		mu.Lock()
		defer mu.Unlock()
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, data)
	f.Flush()
}

// ─── Payload structs ──────────────────────────────────────────────────────────

type anthropicSSEMessageStart struct {
	Type    string              `json:"type"` // "message_start"
	Message anthropicSSEMessage `json:"message"`
}

type anthropicSSEMessage struct {
	ID           string         `json:"id"`
	Type         string         `json:"type"`    // "message"
	Role         string         `json:"role"`    // "assistant"
	Content      []any          `json:"content"` // [] at start
	Model        string         `json:"model"`
	StopReason   *string        `json:"stop_reason"`
	StopSequence *string        `json:"stop_sequence"`
	Usage        anthropicUsage `json:"usage"`
}

type anthropicSSEContentBlockStart struct {
	Type         string                   `json:"type"` // "content_block_start"
	Index        int                      `json:"index"`
	ContentBlock anthropicSSEContentBlock `json:"content_block"`
}

type anthropicSSEContentBlock struct {
	Type string `json:"type"` // "text"
	Text string `json:"text"`
}

type anthropicSSEPing struct {
	Type string `json:"type"` // "ping"
}

type anthropicSSEContentBlockDelta struct {
	Type  string            `json:"type"` // "content_block_delta"
	Index int               `json:"index"`
	Delta anthropicSSEDelta `json:"delta"`
}

type anthropicSSEDelta struct {
	Type string `json:"type"` // "text_delta"
	Text string `json:"text"`
}

type anthropicSSEContentBlockStop struct {
	Type  string `json:"type"` // "content_block_stop"
	Index int    `json:"index"`
}

type anthropicSSEMessageDelta struct {
	Type  string                    `json:"type"` // "message_delta"
	Delta anthropicSSEMessageDeltaV `json:"delta"`
	Usage anthropicOutputUsage      `json:"usage"`
}

type anthropicSSEMessageDeltaV struct {
	StopReason   string  `json:"stop_reason"`
	StopSequence *string `json:"stop_sequence"`
}

type anthropicSSEMessageStop struct {
	Type string `json:"type"` // "message_stop"
}

type anthropicOutputUsage struct {
	OutputTokens int `json:"output_tokens"`
}
