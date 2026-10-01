package tool

import (
	"context"
	"fmt"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// ─── inbox_draft_reply ───────────────────────────────────────────────────────

const DraftReplyToolName = "inbox_draft_reply"

type DraftReplyTool struct {
	backend *inbox.Service
}

func NewDraftReplyTool(backend *inbox.Service) *DraftReplyTool {
	return &DraftReplyTool{backend: backend}
}

func (t *DraftReplyTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        DraftReplyToolName,
		DisplayName: "Draft Inbox Reply",
		Description: "Save a reply as a draft on a thread WITHOUT sending it - the draft is stored so a human can review, edit, or approve it. Use this by default when composing a response; only use inbox_send_reply once the user has explicitly asked for the message to actually go out. Call inbox_get_thread first so the draft is grounded in the real conversation.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"thread_id": map[string]any{
					"type":        "string",
					"description": "The thread ID, as returned by inbox_list_threads.",
				},
				"body": map[string]any{
					"type":        "string",
					"description": "The reply text.",
				},
			},
			"required": []string{"thread_id", "body"},
		}),
		IsReadOnly:         false,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *DraftReplyTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	threadID := stringInput(input.Parsed, "thread_id")
	body := stringInput(input.Parsed, "body")
	if threadID == "" || body == "" {
		return tools.NewErrorResult(fmt.Errorf("thread_id and body are required")), nil
	}
	msg, err := t.backend.SaveDraft(ctx, principal, inbox.SendReplyParams{ThreadID: threadID, Body: body})
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(*msg)
	result.Content = fmt.Sprintf("Draft saved on thread %s (message_id=%s). Not sent - use inbox_send_reply to actually deliver it.", threadID, msg.ID)
	return result, nil
}

func (t *DraftReplyTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *DraftReplyTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *DraftReplyTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *DraftReplyTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *DraftReplyTool) IsReadOnly(_ map[string]any) bool        { return false }
func (t *DraftReplyTool) IsEnabled() bool                         { return t.backend != nil }
func (t *DraftReplyTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *DraftReplyTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

// ─── inbox_send_reply ───────────────────────────────────────────────────────

const SendReplyToolName = "inbox_send_reply"

type SendReplyTool struct {
	backend *inbox.Service
}

func NewSendReplyTool(backend *inbox.Service) *SendReplyTool {
	return &SendReplyTool{backend: backend}
}

func (t *SendReplyTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        SendReplyToolName,
		DisplayName: "Send Inbox Reply",
		Description: "Send a reply on a thread through its real channel (Gmail or WhatsApp) - this delivers an actual message to the contact and cannot be undone. Only call this after the user has explicitly confirmed the message should be sent; when composing on your own initiative, use inbox_draft_reply instead and let a human approve it first. Marks the thread as handled once sent.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"thread_id": map[string]any{
					"type":        "string",
					"description": "The thread ID, as returned by inbox_list_threads.",
				},
				"body": map[string]any{
					"type":        "string",
					"description": "The reply text to send.",
				},
			},
			"required": []string{"thread_id", "body"},
		}),
		IsReadOnly:         false,
		IsConcurrencySafe:  false,
		RequiresPermission: true,
	}
}

func (t *SendReplyTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	threadID := stringInput(input.Parsed, "thread_id")
	body := stringInput(input.Parsed, "body")
	if threadID == "" || body == "" {
		return tools.NewErrorResult(fmt.Errorf("thread_id and body are required")), nil
	}
	msg, err := t.backend.SendReply(ctx, principal, inbox.SendReplyParams{ThreadID: threadID, Body: body})
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(*msg)
	result.Content = fmt.Sprintf("Reply sent on thread %s (message_id=%s).", threadID, msg.ID)
	return result, nil
}

func (t *SendReplyTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *SendReplyTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}

// CheckPermissions defers to the global permission pipeline rather than
// deciding here - RequiresPermission: true on the Definition is what
// actually gates this tool behind user approval; this is intentionally not
// where that policy lives; see internal/knowledge/tool's rag_search-style
// tools for the same pattern.
func (t *SendReplyTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *SendReplyTool) IsConcurrencySafe(_ map[string]any) bool { return false }
func (t *SendReplyTool) IsReadOnly(_ map[string]any) bool        { return false }
func (t *SendReplyTool) IsEnabled() bool                         { return t.backend != nil }
func (t *SendReplyTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *SendReplyTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

var (
	_ tools.Tool = (*DraftReplyTool)(nil)
	_ tools.Tool = (*SendReplyTool)(nil)
)
