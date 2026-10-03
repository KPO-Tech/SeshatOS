// Types mirroring nexus-engine API surface

export type Role = 'user' | 'assistant' | 'system'

export type TextBlock = {
  type: 'text'
  text: string
}

export type ThinkingBlock = {
  type: 'thinking'
  thinking: string
}

export type ToolApproval = {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  description?: string
}

export type PromptOption = {
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

export type QueryRequest = {
  session_id?: string
  prompt: string
  provider_setting_id?: string
  model_id?: string
  permission_mode?: string
  execution_origin?: string
  corpus_id?: string
  file_ids?: string[]
  append_system_prompt?: string
  agent_slug?: string
}

export type QueryResponse = {
  session_id: string
  content: string
  stop_reason?: string
  turn_number?: number
  is_complete: boolean
  usage?: TokenUsage
  tool_uses?: ToolUseBlock[]
  tool_results?: ToolResultBlock[]
  messages?: Message[]
  rag_results?: RAGSearchResult[]
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
export type OAuthChallenge = {
  status: string
  user_code: string
  verification_url: string
  poll_interval_seconds: number
  expires_at: number
}

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

// Legacy alias kept for backward compat
export type Provider = ProviderSetting & {
  models?: ProviderModel[]
}

// ProviderCatalogEntry/ProviderCatalogModel mirror GET /api/v1/models -
// which providers/models this connected seshat-backend build supports,
// resolved live from the SDK's own registry rather than a hardcoded copy
// here (see docs/helps/audit-2026-08-29-openwork-den-comparison.md, item 2).
export type ProviderCatalogModel = {
  id: string
  description?: string
  context_window?: number
  max_output?: number
}

export type ProviderCatalogEntry = {
  name: string
  display_name: string
  description?: string
  auth_type: string
  auth_types?: string[]
  models: ProviderCatalogModel[]
}

// OrgProviderSetting is the organization-wide record backing Admin
// Console's Providers tab (/admin/provider-settings) - deliberately
// distinct from ProviderSetting above, which is this device's own personal
// key (per-user, /settings/providers). Mirrors seshat-server's
// automation.ProviderSetting exactly; never carries an API key.
export type OrgProviderSetting = {
  id: string
  organization_id: string
  created_by_user_id: string
  provider: string
  default_model: string
  base_url?: string
  is_default: boolean
}

// ConnectorOAuthApp mirrors seshat-server's connectors.OAuthApp - the
// client secret is never returned, only whether one is configured. Backs
// Admin Console's own Connectors tab (/admin/connector-oauth-apps), the
// desktop-app counterpart of seshat-console's ConnectorsPage.tsx "OAuth
// apps" modal. Subdomain is only ever set for kind "zendesk" - see
// connectors.zendeskKind's doc comment on the seshat-server side.
export type ConnectorOAuthApp = {
  kind: string
  client_id: string
  configured: boolean
  updated_at: string
  subdomain?: string
}

// AdminMCPServerConfig mirrors seshat-server's mcpregistry.MCPServerConfig
// - never carries Env/Headers (encrypted secrets), only whether the server
// is configured plus connector_kind. Backs Admin Console's own MCP Servers
// tab (/admin/mcp-server-configs), the desktop-app counterpart of
// seshat-console's MCPServersPage.tsx.
export type AdminMCPServerConfig = {
  id: string
  organization_id: string
  created_by_user_id: string
  name: string
  display_name?: string
  server_type: string
  command?: string
  args?: string[]
  url?: string
  timeout_secs: number
  icon?: string
  connector_kind?: string
}

export type User = {
  id: string
  email: string
  display_name: string
  status: string
}

export type ApiKey = {
  id: string
  name: string
  key_preview: string
  created_at: string
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

export type ApiError = {
  error: string
  message: string
  status: number
}

export type WebSearchSettings = {
  id?: string
  user_id: string
  enabled: boolean
  provider_setting_ids: string[]
  allow_env_fallback: boolean
  allowed_domains: string[]
  blocked_domains: string[]
  max_queries_per_day: number
  created_at?: number
  updated_at?: number
  // Subset of allowed_domains/blocked_domains contributed by a connected
  // seshat-server's org policy — omitted in standalone mode or when the
  // org has no policy set.
  org_allowed_domains?: string[]
  org_blocked_domains?: string[]
}

export type DomainCategory = {
  id: string
  label: string
  icon: string
  domains: string[]
}

export type SearchProviderConfig = {
  provider: string
  label: string
  enabled: boolean
  has_api_key: boolean
  base_url: string
  auth_username?: string
  requires_api_key: boolean
  requires_base_url: boolean
  default_base_url: string
  priority: number
  updated_at?: number
  // "organization" | "platform" when resolved from a connected seshat-server
  // rather than personally configured — omitted otherwise.
  source?: string
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
// MCP-backed Action connector), same as ChannelAccount is for Inbox.
export type ConnectorAccount = {
  id: string
  kind: string
  display_name: string
  external_account_id: string
  status: string
  last_synced_at?: number
  last_error?: string
  created_at: number
}

// ActionResult mirrors connector.ActionResult (seshat-backend/internal/connector/types.go)
// exactly, including its unusual PascalCase JSON keys - that struct has no
// json tags, so Go's default field-name marshaling applies, unlike every
// snake_case type elsewhere in this file.
export type ActionResult = {
  Success: boolean
  Message: string
  Data?: Record<string, unknown>
}

export type CorpusFile = {
  corpus_id: string
  file_id: string
  filename: string
  status: string        // 'pending' | 'ingested' | 'failed'
  chunk_count: number
  ingested_at?: number
  created_at: number
}

export type IngestionJob = {
  id: string
  corpus_id: string
  file_id: string
  filename: string
  status: string        // 'pending' | 'running' | 'completed' | 'failed'
  attempt_count: number
  max_attempts: number
  chunk_count: number
  last_error?: string
  started_at?: number
  completed_at?: number
  created_at: number
  updated_at: number
}

export type FileItem = {
  id: string
  filename: string
  content_type: string
  size: number
  created_at: number
}

export type EmbedderConfig = {
  provider: string
  base_url: string
  model: string
  has_api_key: boolean
  enabled: boolean
  is_configured: boolean
  updated_at?: number
}

export type DocumentReaderConfig = {
  base_url: string
  enabled: boolean
  prefer_external: boolean
  updated_at?: number
}

export type RerankerConfig = {
  base_url: string
  model: string
  has_api_key: boolean
  enabled: boolean
  is_configured: boolean
  updated_at?: number
}

export type UserMemory = {
  id: string
  type: string
  key: string
  value: string
  importance: number
  source?: string
  created_at: number
  updated_at: number
}

export type StorageConfigData = {
  provider: string           // 'local' | 's3' | 'minio'
  local_path?: string
  s3_endpoint?: string
  s3_bucket?: string
  s3_region?: string
  s3_key_prefix?: string
  has_s3_access_key: boolean
  has_s3_secret_key: boolean
  is_configured: boolean
  updated_at?: number
}

export type StorageStatus = {
  active_provider: string
  config: StorageConfigData
  restart_required: boolean
}

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
// through policies on seshat-server, not carried on the team itself.
export type OrgTeam = {
  id: string
  organization_id: string
  name: string
  slug: string
  description: string
  member_user_ids: string[]
  created_at: string
  updated_at: string
  scim_external_id?: string
}

// OrgMembership is the organization-wide record backing Admin Console's
// Users tab (/admin/memberships) - deliberately NOT built on the platform-
// wide /users resource, which requires the rare platform super-admin flag a
// normal org admin never has. Mirrors seshat-server's iam.Membership; role
// is the one field an org admin can actually change here, same as
// seshat-console's MembershipsPage.tsx.
export type OrgMembership = {
  id: string
  user_id: string
  organization_id: string
  role: string
  status: string
  pending_since?: string
  created_at: string
  permissions?: string[]
  user_email?: string
  user_display_name?: string
  user_is_admin?: boolean
  scim_external_id?: string
}

// OrgRole is the built-in + custom role catalog for an organization
// (/admin/roles, read-only here) - used only to populate the role picker
// when editing a membership. Creating/editing roles stays console-only
// (RolesPage.tsx).
export type OrgRole = {
  code: string
  name: string
  description?: string
  permissions?: string[]
  system: boolean
}

// OrgInvitation is the organization-wide record backing Admin Console's
// Invitations tab (/admin/invitations) - a promise of access by email that
// hasn't been accepted yet, distinct from OrgMembership (someone who already
// has access). Mirrors seshat-server's iam.Invitation; token is only ever
// populated in the response right after creating an invitation.
export type OrgInvitation = {
  id: string
  organization_id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  token?: string
  created_at: string
  expires_at?: string
  accepted_at?: string
  revoked_at?: string
}

// DesktopPolicy is one entry from seshat-server's fixed, code-defined
// desktop policy catalog (/admin/desktop-policies/catalog) - not
// organization-specific data, just a reference table of what CAN be
// restricted.
export type DesktopPolicy = {
  code: string
  admin_description: string
  user_blocked_message: string
  default_value: boolean
}

// OrgDesktopPolicyBinding is the organization-wide record backing Admin
// Console's Desktop Policies tab (/admin/desktop-policy-bindings). These
// bindings already actively control this exact device's behavior (see
// hooks/useDesktopPolicies.ts, which reads the resolved bundle and locks
// Settings/Providers accordingly) - this tab is what finally lets an org
// admin see and manage them from the desktop app, mirroring
// seshat-console's DesktopPoliciesPage.tsx.
export type OrgDesktopPolicyBinding = {
  id: string
  organization_id: string
  policy_code: string
  subject_type: 'org' | 'role' | 'user' | 'group'
  subject_id: string
  value: boolean
  created_at: string
  updated_at: string
}

// OrgAgentPreset is the organization-wide record backing Admin Console's
// Agents tab (/admin/agent-presets) - deliberately separate from this
// device's own personal agents (Settings/Workspace → Agents, which also
// shows this same catalog read-only as an enrichment - see
// internal/agents.Service.ListOrganizationPresets). Mirrors seshat-server's
// agentregistry.AgentPreset exactly; the same store seshat-console's
// AgentPresetsPage.tsx edits.
export type OrgAgentPreset = {
  id: string
  organization_id: string
  created_by_user_id?: string
  slug: string
  name: string
  when_to_use?: string
  system_prompt?: string
  model?: string
  tools?: string[]
  disallowed_tools?: string[]
  max_turns?: number
  permission_mode?: string
  isolation?: string
  mcp_servers?: string[]
  icon?: string
  enabled: boolean
  created_at?: string
  updated_at?: string
}

export type AdminOrganization = {
  id: string
  name: string
  slug: string
  owner_user_id?: string
  status: string
}

// AdminAutomationJob mirrors seshat-server's automation.Job, proxied via
// seshat-backend's /automation/jobs (internal/api/automation_jobs.go) - used
// by Admin Console's Overview for a "Recent jobs" summary and by the
// scheduled-job builder elsewhere.
export type AdminAutomationJob = {
  id: string
  organization_id: string
  name: string
  status: string
  trigger_type: string
  execution_target: string
  target_device_id?: string
  last_run_at?: string
  last_run_status?: string
  next_run_at?: string
  created_at?: string
}

export type AdminWorkspace = {
  id: string
  organization_id: string
  name: string
  slug: string
  status: string
}

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

export type AgentSource = 'user' | 'built-in' | 'builtin' | 'organization' | 'workflow'

export type Agent = {
  id?: string
  slug: string
  name: string
  when_to_use: string
  system_prompt: string
  model: string
  tools: string[]
  disallowed_tools: string[]
  max_turns: number
  permission_mode: string
  isolation: string
  mcp_servers: string[]
  icon: string
  enabled: boolean
  source: AgentSource
  created_at?: number
  updated_at?: number
}

export type CreateAgentBody = {
  slug: string
  name?: string
  when_to_use?: string
  system_prompt?: string
  model?: string
  tools?: string[]
  disallowed_tools?: string[]
  max_turns?: number
  permission_mode?: string
  isolation?: string
  mcp_servers?: string[]
  icon?: string
  enabled?: boolean
  // '' (default, omitted) for a normal Companion persona, 'workflow' for
  // one created inline by an Automation graph's own "agent" node - see
  // AgentPickerField.tsx. The backend rejects any other value here.
  source?: 'workflow'
}

export type UpdateAgentBody = Partial<Omit<CreateAgentBody, 'slug'>>

// ─── Scheduled jobs ───────────────────────────────────────────────────────────

export type JobStatus = '' | 'ok' | 'error' | 'running'

export type ScheduledJob = {
  id: string
  name: string
  cron_expr: string
  agent_slug: string
  prompt: string
  session_title: string
  enabled: boolean
  last_run_at?: string   // ISO-8601, absent when never ran
  next_run_at: string    // ISO-8601
  last_status: JobStatus
  last_error: string
  created_at: string
  updated_at: string
}

export type CreateJobBody = {
  name?: string
  cron_expr: string
  prompt: string
  agent_slug?: string
  session_title?: string
  enabled?: boolean
}

export type UpdateJobBody = Partial<CreateJobBody>

// ─── Automation jobs (seshat-automation daemon) ───────────────────────────────

export type AutomationTriggerType = 'cron' | 'interval' | 'once'

export type AutomationTrigger = {
  type: AutomationTriggerType
  cron?: string
  interval?: string   // Go duration string, e.g. "24h"
  run_at?: string     // RFC3339
}

export type AutomationAgentConfig = {
  slug?: string
  base_type?: string
  tools?: string[]
  skills?: string[]
  model?: string
  max_turns?: number
  system_prompt?: string
}

export type AutomationJobStatus = 'active' | 'paused' | 'inactive'
export type AutomationRunStatus = 'running' | 'success' | 'error'

export type AutomationJob = {
  id: string
  owner_id: string
  name: string
  description: string
  trigger: AutomationTrigger
  agent: AutomationAgentConfig
  task: string
  status: AutomationJobStatus
  last_run_at?: string   // RFC3339
  next_run_at?: string   // RFC3339
  last_run_status: string
  created_at: string
  updated_at: string
}

export type AutomationRun = {
  id: string
  job_id: string
  started_at: string
  ended_at?: string
  status: AutomationRunStatus
  output: string
  error: string
}

export type CreateAutomationJobBody = {
  name: string
  description?: string
  trigger: AutomationTrigger
  agent: AutomationAgentConfig
  task: string
}

// ─── Plan runtime event ───────────────────────────────────────────────────────

export type PlanRuntimeEvent = {
  plan_id: string
  slug: string
  filename: string
  status: PlanStatus
  version: number
}

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
