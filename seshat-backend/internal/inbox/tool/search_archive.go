package tool

import (
	"context"
	"fmt"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// ─── inbox_search_messages ──────────────────────────────────────────────────

const SearchMessagesToolName = "inbox_search_messages"

type SearchMessagesTool struct {
	backend *inbox.Service
}

func NewSearchMessagesTool(backend *inbox.Service) *SearchMessagesTool {
	return &SearchMessagesTool{backend: backend}
}

func (t *SearchMessagesTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        SearchMessagesToolName,
		DisplayName: "Search Inbox Messages",
		Description: "Search one connected channel's mailbox directly (not just what's already been triaged), e.g. to find every newsletter/subscription email from a sender, or a specific old message that isn't in the recent inbox_list_threads view. For Gmail, query uses Gmail's own search syntax (from:/subject:/is:unread/has:attachment/after:/label:...); for Outlook, it's a plain free-text search over subject/body/sender. Matching threads become part of the normal inbox (usable with inbox_get_thread/inbox_archive_thread/inbox_set_thread_read_status afterward) without triggering any standing automation rules. Use inbox_list_accounts first to get a channel_account_id.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"channel_account_id": map[string]any{
					"type":        "string",
					"description": "The channel account to search within, as returned by inbox_list_accounts.",
				},
				"query": map[string]any{
					"type":        "string",
					"description": "The search query (Gmail search syntax for Gmail; free text for Outlook).",
				},
				"limit": map[string]any{
					"type":        "integer",
					"description": "Maximum number of matching messages to return (default 25).",
					"minimum":     1,
					"maximum":     100,
				},
			},
			"required": []string{"channel_account_id", "query"},
		}),
		IsReadOnly:         true,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *SearchMessagesTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	channelAccountID := stringInput(input.Parsed, "channel_account_id")
	query := stringInput(input.Parsed, "query")
	if channelAccountID == "" || query == "" {
		return tools.NewErrorResult(fmt.Errorf("channel_account_id and query are required")), nil
	}
	threads, err := t.backend.SearchMessages(ctx, principal, channelAccountID, query, intInput(input.Parsed, "limit"))
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(threads)
	result.Content = formatThreadList(threads, false, len(threads))
	result.Metadata = &tools.ResultMetadata{Additional: map[string]any{"count": len(threads)}}
	return result, nil
}

func (t *SearchMessagesTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *SearchMessagesTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *SearchMessagesTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *SearchMessagesTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *SearchMessagesTool) IsReadOnly(_ map[string]any) bool        { return true }
func (t *SearchMessagesTool) IsEnabled() bool                         { return t.backend != nil }
func (t *SearchMessagesTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	if threads, ok := data.([]inbox.Thread); ok {
		return formatThreadList(threads, false, len(threads))
	}
	return ""
}
func (t *SearchMessagesTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

// ─── inbox_archive_thread ───────────────────────────────────────────────────

const ArchiveThreadToolName = "inbox_archive_thread"

type ArchiveThreadTool struct {
	backend *inbox.Service
}

func NewArchiveThreadTool(backend *inbox.Service) *ArchiveThreadTool {
	return &ArchiveThreadTool{backend: backend}
}

func (t *ArchiveThreadTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        ArchiveThreadToolName,
		DisplayName: "Archive Inbox Thread",
		Description: "Move every message in a thread to Trash/Deleted Items on its real channel - useful for clearing out unwanted subscriptions/newsletters found via inbox_search_messages or flagged during triage. This removes the mail from the user's inbox on the actual provider, not just locally; both Gmail and Outlook keep trashed mail for a retention window, but there's no undo tool here. Only call this after the user has confirmed which threads should go, unless they've explicitly told you to clean up a specific known category on your own (e.g. \"archive anything from this sender\"). Marks the thread handled once archived.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"thread_id": map[string]any{
					"type":        "string",
					"description": "The thread ID, as returned by inbox_list_threads or inbox_search_messages.",
				},
			},
			"required": []string{"thread_id"},
		}),
		IsReadOnly:         false,
		IsConcurrencySafe:  false,
		RequiresPermission: true,
	}
}

func (t *ArchiveThreadTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	threadID := stringInput(input.Parsed, "thread_id")
	if threadID == "" {
		return tools.NewErrorResult(fmt.Errorf("thread_id is required")), nil
	}
	if err := t.backend.ArchiveThread(ctx, principal, threadID); err != nil {
		return tools.NewErrorResult(err), nil
	}
	return tools.NewTextResult(fmt.Sprintf("Thread %s archived (moved to trash on its channel).", threadID)), nil
}

func (t *ArchiveThreadTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *ArchiveThreadTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}

// CheckPermissions defers to the global permission pipeline rather than
// deciding here - RequiresPermission: true on the Definition is what
// actually gates this tool, same posture as SendReplyTool.
func (t *ArchiveThreadTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *ArchiveThreadTool) IsConcurrencySafe(_ map[string]any) bool { return false }
func (t *ArchiveThreadTool) IsReadOnly(_ map[string]any) bool        { return false }
func (t *ArchiveThreadTool) IsEnabled() bool                         { return t.backend != nil }
func (t *ArchiveThreadTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *ArchiveThreadTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

// ─── inbox_set_thread_read_status ───────────────────────────────────────────

const SetThreadReadStatusToolName = "inbox_set_thread_read_status"

type SetThreadReadStatusTool struct {
	backend *inbox.Service
}

func NewSetThreadReadStatusTool(backend *inbox.Service) *SetThreadReadStatusTool {
	return &SetThreadReadStatusTool{backend: backend}
}

func (t *SetThreadReadStatusTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        SetThreadReadStatusToolName,
		DisplayName: "Mark Inbox Thread Read/Unread",
		Description: "Mark every message in a thread read or unread on its real channel. This is the provider's own read/unread flag, separate from inbox_update_thread_status's triage status (open/handled/snoozed/escalated) - use it when the user specifically asks about read state, e.g. \"mark that as unread so I remember to look at it\".",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"thread_id": map[string]any{
					"type":        "string",
					"description": "The thread ID, as returned by inbox_list_threads.",
				},
				"read": map[string]any{
					"type":        "boolean",
					"description": "true to mark read, false to mark unread.",
				},
			},
			"required": []string{"thread_id", "read"},
		}),
		IsReadOnly:         false,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *SetThreadReadStatusTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	threadID := stringInput(input.Parsed, "thread_id")
	if threadID == "" {
		return tools.NewErrorResult(fmt.Errorf("thread_id is required")), nil
	}
	read, _ := input.Parsed["read"].(bool)
	if err := t.backend.SetThreadReadStatus(ctx, principal, threadID, read); err != nil {
		return tools.NewErrorResult(err), nil
	}
	state := "unread"
	if read {
		state = "read"
	}
	return tools.NewTextResult(fmt.Sprintf("Thread %s marked %s.", threadID, state)), nil
}

func (t *SetThreadReadStatusTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *SetThreadReadStatusTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *SetThreadReadStatusTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *SetThreadReadStatusTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *SetThreadReadStatusTool) IsReadOnly(_ map[string]any) bool        { return false }
func (t *SetThreadReadStatusTool) IsEnabled() bool                         { return t.backend != nil }
func (t *SetThreadReadStatusTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	return ""
}
func (t *SetThreadReadStatusTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

var (
	_ tools.Tool = (*SearchMessagesTool)(nil)
	_ tools.Tool = (*ArchiveThreadTool)(nil)
	_ tools.Tool = (*SetThreadReadStatusTool)(nil)
)
