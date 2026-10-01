package query

import (
	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat/pkg/contract"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	"github.com/KPO-Tech/seshat/pkg/types"
)

// ImageAttachment carries base64-encoded image data for a single turn.
type ImageAttachment struct {
	MediaType string // e.g. "image/jpeg"
	Data      string // base64-encoded bytes
}

type QueryInput struct {
	Prompt            string
	SessionID         string
	ProviderSettingID string
	ModelID           string
	RuntimeProvider   *RuntimeProviderConfig
	// UserID identifies the caller for the SDK's PlanStore (submit_plan) -
	// without it every plan document is persisted with an empty UserID,
	// which then fails its own ownership check on every later read
	// (Get/Patch compares against the real, non-empty principal.User.ID).
	// Populated in prepareRuntimeInput from the request's principal.
	UserID string
	// RAGAllowedOwnerIDs scopes the rag_search/rag_ingest/rag_delete tools
	// (wired onto the session whenever a RAGService is configured) to
	// corpora this caller actually owns or shares a workspace with -
	// mirrors knowledge.Service.checkAccess's own rule (corpus.UserID or
	// corpus.WorkspaceID membership) so the model's own tool call can't
	// reach a corpus_id belonging to someone else. Populated in
	// prepareRuntimeInput from the request's principal; empty means no
	// scoping is applied (headless/unscoped mode).
	RAGAllowedOwnerIDs []string
	PromptFn           types.PromptFn        // per-request permission bridge, optional
	PermissionMode     types.PermissionMode  // effective tool approval mode for this turn/session
	ExecutionOrigin    types.ExecutionOrigin // interactive vs automation provenance
	WebSearchRunner    sdk.WebSearchRunnerFn // per-request DB-backed web search bridge, optional
	AppendSystemPrompt *string               // per-request system prompt append (e.g. user preferences)
	// AgentSlug identifies an agent profile (built-in or skill-derived) to
	// apply for this session. When set, the agent's system prompt, model, and
	// permission mode override the defaults unless already explicitly provided.
	AgentSlug string
	// AllowedTools, when non-empty, restricts the session to exactly these
	// tool names for this turn - populated from the resolved agent
	// definition's Tools allowlist in BuildContextInput. Empty means no
	// restriction (the full global tool set stays available), matching how
	// AgentDefinition.Tools == nil means "unrestricted" elsewhere.
	AllowedTools []string
	// SystemPromptOverride fully replaces the engine's default system prompt
	// (Seshat Core identity + rules + workflow). Used when an agent needs its
	// own identity rather than layering on top of Seshat Core via AppendSystemPrompt.
	SystemPromptOverride *string
	// WorkspacePath is the session sandbox the agent may read/write freely.
	// Populated from the session's ownership record; auto-created under ~/.config/seshat/workspaces/.
	WorkspacePath string
	// ProjectPath is the user-chosen project directory (optional).
	// When set, used as the agent's CWD; the workspace sandbox is still available for uploads/plans.
	ProjectPath string
	// Images carries base64-encoded image attachments for this turn (multimodal).
	Images []ImageAttachment
	// ForcedExecutionMode is a host-set override ("plan"/"execute") read from
	// the session's ownership record — applied to the SDK session right
	// before this turn is submitted via Session.ForcePlanMode()/
	// ClearPlanMode(), independent of whether the model itself would decide
	// to call enter_plan_mode/exit_plan_mode. Empty means no override.
	ForcedExecutionMode string
}

type QueryResult struct {
	SessionID   string
	Content     string
	StopReason  string
	TurnNumber  int
	IsComplete  bool
	Usage       *types.TokenUsage
	ToolUses    []types.ToolUseContent
	ToolResults []contract.CallResult
	Messages    []types.Message
}

type RuntimeProviderConfig struct {
	SettingID string
	Provider  string
	BaseURL   string
	ModelID   string
	Secret    string
}

// SessionInfo is the backend-layer view of a session: ownership metadata merged
// with basic runtime state. Returned by Service.ListSessions.
type SessionInfo struct {
	SessionID         string `json:"session_id"`
	UserID            string `json:"user_id,omitempty"`
	ProviderSettingID string `json:"provider_setting_id,omitempty"`
	ModelID           string `json:"model_id,omitempty"`
	WorkspaceID       string `json:"workspace_id,omitempty"`
	OrganizationID    string `json:"organization_id,omitempty"`
	Title             string `json:"title"`
	PermissionMode    string `json:"permission_mode,omitempty"`
	ExecutionOrigin   string `json:"execution_origin,omitempty"`
	ExecutionMode     string `json:"execution_mode,omitempty"`
	Source            string `json:"source,omitempty"`
	WorkspacePath     string `json:"workspace_path,omitempty"`
	ProjectPath       string `json:"project_path,omitempty"`
	Status            string `json:"status,omitempty"`
	TotalTurns        int    `json:"total_turns,omitempty"`
	TotalTokens       int    `json:"total_tokens,omitempty"`
	CreatedAt         int64  `json:"created_at"`
	UpdatedAt         int64  `json:"updated_at"`
}

// SessionDetail is the transport-friendly session payload used by the HTTP API.
// It extends SessionInfo with the canonical transcript restored from persistence.
type SessionDetail struct {
	SessionInfo
	Messages []types.Message `json:"messages,omitempty"`
}

// RAGSearchResult is the transport-friendly view of one knowledge base search hit.
type RAGSearchResult struct {
	Key      string            `json:"key"`
	Text     string            `json:"text"`
	Score    float32           `json:"score"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// ContextBuildParams holds the resolved, validated inputs for BuildContextInput.
// Both the blocking and streaming query handlers use this to guarantee identical behaviour.
type ContextBuildParams struct {
	Prompt             string
	SessionID          string
	ProviderSettingID  string
	ModelID            string
	PermissionMode     types.PermissionMode
	ExecutionOrigin    types.ExecutionOrigin
	PromptFn           types.PromptFn // nil for the non-streaming path
	CorpusID           string
	FileIDs            []string
	AppendSystemPrompt *string
	AgentSlug          string
	Principal          *backendauth.Principal
	// OnStage, when set, is called once right before the one sub-phase of
	// context building slow enough to be worth naming individually to the
	// client (the RAG search) - see the [perf] context_build timings this
	// mirrors. Skills/memories/preferences stay bundled implicitly since
	// they're fast relative to it.
	OnStage func(stage, label string)
}
