// Types mirroring the SeshatOS backend API surface

type Role = 'user' | 'assistant' | 'system'

type TextBlock = {
  type: 'text'
  text: string
}

type ThinkingBlock = {
  type: 'thinking'
  thinking: string
}

export type ToolApproval = {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  description?: string
}

type PromptOption = {
  label: string
  value: unknown
  description?: string
}

export type ToolPromptRequest = {
  promptId: string
  type: 'choice' | 'text' | 'confirm'
  message: string
  options?: PromptOption[]
  default?: unknown
  metadata?: Record<string, unknown>
}

export type ToolStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'

export type ToolRenderResult = {
  content: string
  isError: boolean
  durationMs?: number
  metadata?: Record<string, unknown>
}

export type ToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  metadata?: Record<string, unknown>
  // Frontend-only fields used by the chat renderer/state machine
  _result?: ToolRenderResult
  _status?: ToolStatus
  _approval?: ToolApproval
  _prompt?: ToolPromptRequest
  _partialInput?: string
  _message?: string
}

export type ToolResultBlock = {
  type: 'tool_result'
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
  metadata?: Record<string, unknown>
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

export type Message = {
  id?: string
  role: Role
  content: ContentBlock[]
  timestamp?: string
  metadata?: Record<string, unknown>
  // status is client-only bookkeeping for an optimistically-added user
  // message that hasn't been confirmed by the server yet - never present on
  // a message the server itself returns (see useChat.ts's commitDonePayload,
  // which replaces the whole array with the server's own messages on
  // success, naturally clearing this). 'sending' while in flight, 'error'
  // if the turn fails or a hard timeout elapses with no progress.
  status?: 'sending' | 'error'
}

export type TokenUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export type StreamEvent =
  | { type: 'content_block_start'; content_block: ContentBlock }
  | { type: 'content_block_delta'; delta?: string; delta_type?: 'text_delta' | 'thinking_delta' | 'input_json_delta'; partial_json?: string }
  | { type: 'content_block_stop' }
  | { type: 'message_delta'; stop_reason?: string; usage?: TokenUsage }
  | { type: 'message_stop'; stop_reason?: string }
  | { type: 'error'; error?: { message?: string } }

export type Session = {
  session_id: string
  user_id?: string
  title?: string
  created_at: number
  updated_at: number
  messages: Message[]
  // Messages a compaction took out of what the model sees, oldest first. They are shown above `messages` so that a
  // compacted session keeps its scrollback.
  archived_messages?: Message[]
  provider_setting_id?: string
  model_id?: string
  permission_mode?: string
  execution_origin?: string
  workspace_path?: string
  project_path?: string
  total_turns?: number
}

export type ProviderModel = {
  id: string
  provider_setting_id: string
  model_id: string
  display_name: string
  context_window: number
  max_output: number
  default_temperature: number
  description: string
  is_default: boolean
  sort_order: number
  source: 'catalog' | 'user'
  created_at: number
  updated_at: number
}

// ProviderSetting matches the backend settingResponse struct
export type ProviderSetting = {
  id: string
  user_id: string
  provider: string
  name: string
  auth_kind: string
  base_url: string
  model_id: string
  has_api_key: boolean
  is_default: boolean
  connection_status: string
  last_error?: string
  oauth_account_email?: string
  oauth_subject?: string
  oauth_expires_at?: number
  created_at: number
  updated_at: number
}

// ProviderCatalogEntry/ProviderCatalogModel mirror GET /api/v1/models -
// which providers/models this connected seshat-backend build supports,
// resolved live from the SDK's own registry rather than a hardcoded copy

// OrgProviderSetting is the organization-wide record backing Admin
// Console's Providers tab (/admin/provider-settings) - deliberately
// distinct from ProviderSetting above, which is this device's own personal
// key (per-user, /settings/providers). Mirrors seshat-server's

// ConnectorOAuthApp mirrors seshat-server's connectors.OAuthApp - the
// client secret is never returned, only whether one is configured. Backs
// Admin Console's own Connectors tab (/admin/connector-oauth-apps), the
// desktop-app counterpart of seshat-console's ConnectorsPage.tsx "OAuth
// apps" modal. Subdomain is only ever set for kind "zendesk" - see

// AdminMCPServerConfig mirrors seshat-server's mcpregistry.MCPServerConfig
// - never carries Env/Headers (encrypted secrets), only whether the server
// is configured plus connector_kind. Backs Admin Console's own MCP Servers
// tab (/admin/mcp-server-configs), the desktop-app counterpart of

export type User = {
  id: string
  email: string
  display_name: string
  status: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type LoginResponse = {
  token: string
  expires_at: string
  user: User
  roles: string[]
}

export type Corpus = {
  id: string
  user_id: string
  workspace_id?: string
  name: string
  description?: string
  chunk_count: number
  created_at: number
  updated_at: number
}

// ConnectorAccount mirrors seshat-backend's connectorAccountResponse
// (internal/api/knowledge/gdrive.go) - the generic, kind-agnostic shape
// shared by every internal/connector implementation (Drive, S3, the

// ActionResult mirrors connector.ActionResult (seshat-backend/internal/connector/types.go)
// exactly, including its unusual PascalCase JSON keys - that struct has no
// json tags, so Go's default field-name marshaling applies, unlike every

export type UserPreferences = {
  user_id?: string
  preferred_name: string
  profession: string
  about: string
  working_style: string
  response_style: string
  extra_context: string
  interactive_permission_mode?: string
  automation_permission_mode?: string
  max_sub_agent_depth?: number
  /** Opt-in to long-term memory (notes extracted from conversations and recalled into prompts). Off by default. */
  memory_enabled?: boolean
  updated_at?: number
}

export type RAGSearchResult = {
  key: string
  text: string
  score: number
  metadata?: Record<string, string>
}

export type SessionSearchResult = {
  session_id: string
  title: string
  preview?: string
  created_at: number
  updated_at: number
}

// OrgTeam is the organization-wide record backing Admin Console's Teams
// tab (/admin/teams) - replaced the old local, per-device "Groups" feature-
// permission bundle. Mirrors seshat-server's iam.Group exactly; membership
// is a plain list of user IDs, and permissions are assigned separately

// OrgMembership is the organization-wide record backing Admin Console's
// Users tab (/admin/memberships) - deliberately NOT built on the platform-
// wide /users resource, which requires the rare platform super-admin flag a
// normal org admin never has. Mirrors seshat-server's iam.Membership; role
// is the one field an org admin can actually change here, same as

// OrgRole is the built-in + custom role catalog for an organization
// (/admin/roles, read-only here) - used only to populate the role picker
// when editing a membership. Creating/editing roles stays console-only

// OrgInvitation is the organization-wide record backing Admin Console's
// Invitations tab (/admin/invitations) - a promise of access by email that
// hasn't been accepted yet, distinct from OrgMembership (someone who already
// has access). Mirrors seshat-server's iam.Invitation; token is only ever

// DesktopPolicy is one entry from seshat-server's fixed, code-defined
// desktop policy catalog (/admin/desktop-policies/catalog) - not
// organization-specific data, just a reference table of what CAN be

// OrgDesktopPolicyBinding is the organization-wide record backing Admin
// Console's Desktop Policies tab (/admin/desktop-policy-bindings). These
// bindings already actively control this exact device's behavior (see
// hooks/useDesktopPolicies.ts, which reads the resolved bundle and locks
// Settings/Providers accordingly) - this tab is what finally lets an org
// admin see and manage them from the desktop app, mirroring

// OrgAgentPreset is the organization-wide record backing Admin Console's
// Agents tab (/admin/agent-presets) - deliberately separate from this
// device's own personal agents (Settings/Workspace → Agents, which also
// shows this same catalog read-only as an enrichment - see
// internal/agents.Service.ListOrganizationPresets). Mirrors seshat-server's
// agentregistry.AgentPreset exactly; the same store seshat-console's

// AdminAutomationJob mirrors seshat-server's automation.Job, proxied via
// seshat-backend's /automation/jobs (internal/api/automation_jobs.go) - used
// by Admin Console's Overview for a "Recent jobs" summary and by the

// ─── Plan documents ───────────────────────────────────────────────────────────

export type PlanStatus = 'pending' | 'validated' | 'rejected'

export type PlanDocument = {
  id: string
  session_id: string
  slug: string
  filename: string
  content: string
  status: PlanStatus
  version: number
  created_at: number
  updated_at: number
}

// ─── Agents ───────────────────────────────────────────────────────────────────

// ─── Scheduled jobs ───────────────────────────────────────────────────────────

// ─── Automation jobs (seshat-automation daemon) ───────────────────────────────


// ─── Plan runtime event ───────────────────────────────────────────────────────

export type RegisterRequest = {
  name: string
  email: string
  password: string
}

export type AuthSession = {
  user: User
  roles: string[]
  isAuthenticated: boolean
}

export type SystemStatus = {
  mode: 'standalone' | 'connected'
  server_url?: string
  sandbox_confined?: boolean
  sandbox_kind?: string
  document_reader_configured?: boolean
  document_conversion_available?: boolean
  document_local_basic_available?: boolean
  document_pdfsmart_available?: boolean
  document_nativedoc_compiled?: boolean
  document_nativedoc_runtime_initialized?: boolean
  document_nativedoc_models_available?: boolean
  document_nativedoc_ready?: boolean
  document_vision_fallback_configured?: boolean
  document_external_configured?: boolean
  document_reader_reachable?: boolean
  document_reader_tested_at?: number
  document_external_conversion_available?: boolean
  document_external_conversion_error?: string
  document_hybrid_chunking_configured?: boolean
  document_hybrid_chunking_error?: string
  local_stt_configured?: boolean
  image_generation_configured?: boolean
}
