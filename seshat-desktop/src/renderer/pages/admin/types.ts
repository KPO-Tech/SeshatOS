// Organization-scoped admin resources, mirrored from seshat-server's iam
// package via seshat-backend's /admin/* endpoints. Distinct from the
// platform-wide types in @renderer/api/types - these only exist once a
// device is connected to an organization server.

export type OrgTeam = {
  id: string
  organization_id: string
  name: string
  slug: string
  description: string
  member_user_ids: string[]
  created_at: string
  updated_at: string
}

// A membership is someone who already has access to the organization -
// deliberately not the platform-wide Users resource, which requires a rare
// platform super-admin flag a normal org admin never has.
export type OrgMembership = {
  id: string
  user_id: string
  organization_id: string
  role: string
  status: string
  created_at: string
  user_email?: string
  user_display_name?: string
}

// The built-in + custom role catalog, used to populate role pickers.
export type OrgRole = {
  code: string
  name: string
  description?: string
  system: boolean
}

// A promise of access by email that hasn't been accepted yet - distinct
// from OrgMembership.
export type OrgInvitation = {
  id: string
  organization_id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  created_at: string
  expires_at?: string
}

// The organization-wide provider credential - distinct from a personal key
// (Settings > Providers, per-user). Never carries the API key back.
export type OrgProviderSetting = {
  id: string
  organization_id: string
  provider: string
  default_model: string
  base_url?: string
  is_default: boolean
}

// One entry from the fixed, code-defined catalog of what CAN be restricted
// on a device (/admin/desktop-policies/catalog) - not organization data.
export type DesktopPolicy = {
  code: string
  admin_description: string
  user_blocked_message: string
  default_value: boolean
}

// A binding assigns a policy's value to a subject (the whole org, a role, a
// user, or a team) - every policy defaults to allowed, a binding can only
// restrict further.
export type OrgDesktopPolicyBinding = {
  id: string
  organization_id: string
  policy_code: string
  subject_type: 'org' | 'role' | 'user' | 'group'
  subject_id: string
  value: boolean
  created_at: string
}

// Mirrors seshat-server's connectors.OAuthApp - the client secret is never
// returned, only whether one is configured.
export type ConnectorOAuthApp = {
  kind: string
  client_id: string
  configured: boolean
  updated_at: string
  subdomain?: string
}

// The organization-wide shared agent preset catalog - separate from this
// device's own personal agents, which read this same catalog read-only as
// an enrichment.
export type OrgAgentPreset = {
  id: string
  organization_id: string
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
}

// Mirrors seshat-server's mcpregistry.MCPServerConfig - never carries
// Env/Headers (encrypted secrets), only whether the server is configured
// plus its connector_kind.
export type AdminMCPServerConfig = {
  id: string
  organization_id: string
  name: string
  display_name?: string
  server_type: string
  command?: string
  args?: string[]
  url?: string
  timeout_secs: number
  connector_kind?: string
}

export type AdminWebSearchOrgPolicy = {
  allowed_domains: string[]
  blocked_domains: string[]
}

export type AuditEntry = {
  id: string
  actor_user_id: string
  action: string
  resource_type?: string
  resource_id?: string
  ip_address?: string
  status: string
  created_at: string
}

export type AuditPage = {
  logs: AuditEntry[]
  count: number
  limit: number
  offset: number
}
