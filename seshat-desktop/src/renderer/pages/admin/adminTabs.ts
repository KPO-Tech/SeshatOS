export type AdminTab =
  | 'overview'
  | 'users'
  | 'teams'
  | 'invitations'
  | 'auditLogs'
  | 'desktopPolicies'
  | 'connectors'
  | 'providers'
  | 'agents'
  | 'mcpServers'
  | 'webSearch'

// Tabs whose data only exists at the organization level - meaningless
// without a connected seshat-server. Audit Logs is deliberately excluded:
// it always shows something (this device's own local activity when
// standalone), so gating it would be misleading.
export const ORGANIZATION_TABS = new Set<AdminTab>([
  'users',
  'teams',
  'invitations',
  'desktopPolicies',
  'connectors',
  'providers',
  'agents',
  'mcpServers',
  'webSearch',
])
