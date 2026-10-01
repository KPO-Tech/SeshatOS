package tool

import (
	"context"
	"fmt"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// ─── inbox_list_accounts ─────────────────────────────────────────────────────

const ListAccountsToolName = "inbox_list_accounts"

type ListAccountsTool struct {
	backend *inbox.Service
}

func NewListAccountsTool(backend *inbox.Service) *ListAccountsTool {
	return &ListAccountsTool{backend: backend}
}

func (t *ListAccountsTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        ListAccountsToolName,
		DisplayName: "List Inbox Accounts",
		Description: "List the connected inbox channel accounts (Gmail, WhatsApp) and their status. Use this to find a channel_account_id for inbox_search_contacts, or to check whether a channel needs reconnecting before relying on it.",
		Category:    "inbox",
		InputSchema: tools.FromMap(map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		}),
		IsReadOnly:         true,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *ListAccountsTool) Call(ctx context.Context, _ tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	accounts, err := t.backend.ListAccounts(ctx, principal)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(accounts)
	result.Content = formatAccountList(accounts)
	return result, nil
}

func (t *ListAccountsTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *ListAccountsTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *ListAccountsTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *ListAccountsTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *ListAccountsTool) IsReadOnly(_ map[string]any) bool        { return true }
func (t *ListAccountsTool) IsEnabled() bool                         { return t.backend != nil }
func (t *ListAccountsTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	if accounts, ok := data.([]inbox.ChannelAccount); ok {
		return formatAccountList(accounts)
	}
	return ""
}
func (t *ListAccountsTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

func formatAccountList(accounts []inbox.ChannelAccount) string {
	if len(accounts) == 0 {
		return "No inbox accounts connected."
	}
	var sb strings.Builder
	for _, a := range accounts {
		fmt.Fprintf(&sb, "[%s] %s (%s) — status=%s  account_id=%s\n", a.Channel, a.DisplayName, a.ExternalAccountID, a.Status, a.ID)
	}
	return strings.TrimRight(sb.String(), "\n")
}

// ─── inbox_search_contacts ───────────────────────────────────────────────────

const SearchContactsToolName = "inbox_search_contacts"

type SearchContactsTool struct {
	backend *inbox.Service
}

func NewSearchContactsTool(backend *inbox.Service) *SearchContactsTool {
	return &SearchContactsTool{backend: backend}
}

func (t *SearchContactsTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        SearchContactsToolName,
		DisplayName: "Search Inbox Contacts",
		Description: "Search contacts by name or address within one connected inbox account (email address or WhatsApp number). Use inbox_list_accounts first to get a channel_account_id.",
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
					"description": "Search text - matched against contact display name and address.",
				},
				"limit": map[string]any{
					"type":        "integer",
					"description": "Maximum number of contacts to return (default 20).",
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

func (t *SearchContactsTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	channelAccountID := stringInput(input.Parsed, "channel_account_id")
	query := stringInput(input.Parsed, "query")
	if channelAccountID == "" || query == "" {
		return tools.NewErrorResult(fmt.Errorf("channel_account_id and query are required")), nil
	}
	contacts, err := t.backend.SearchContacts(ctx, principal, channelAccountID, query, intInput(input.Parsed, "limit"))
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(contacts)
	result.Content = formatContactList(contacts)
	return result, nil
}

func (t *SearchContactsTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *SearchContactsTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *SearchContactsTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *SearchContactsTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *SearchContactsTool) IsReadOnly(_ map[string]any) bool        { return true }
func (t *SearchContactsTool) IsEnabled() bool                         { return t.backend != nil }
func (t *SearchContactsTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	if contacts, ok := data.([]inbox.Contact); ok {
		return formatContactList(contacts)
	}
	return ""
}
func (t *SearchContactsTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

func formatContactList(contacts []inbox.Contact) string {
	if len(contacts) == 0 {
		return "No matching contacts."
	}
	var sb strings.Builder
	for _, c := range contacts {
		fmt.Fprintf(&sb, "%s (%s)\n", c.DisplayName, c.ExternalID)
	}
	return strings.TrimRight(sb.String(), "\n")
}

var (
	_ tools.Tool = (*ListAccountsTool)(nil)
	_ tools.Tool = (*SearchContactsTool)(nil)
)
