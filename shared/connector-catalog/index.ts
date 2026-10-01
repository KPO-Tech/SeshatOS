// @seshat/connector-catalog - the canonical list of every connector kind
// (which OAuth/static kinds exist, their display label, which brand icon
// they map to, and the MCP/vendor endpoints worth pre-filling), consumed
// by both seshat-console and seshat-ui instead of each hand-maintaining
// its own copy. That duplication is exactly how kind lists drifted twice
// in one week (2026-09-03): once between the two apps' MCP "Bridged
// account" dropdowns (OneDrive/Sheets/Calendar missing from one, a stale
// Zendesk entry in the other), once on seshat-console's own Connectors
// page (its OAuth-apps section only listed 4 of the 20 real kinds). This
// package is the fix: one file to update when a kind's status changes,
// consumed everywhere instead of copied everywhere.
//
// No React/icon-library dependency here on purpose - seshat-console
// renders brand icons via @ant-design/icons + the simple-icons npm
// package directly, seshat-ui via @icon-park/react + simple-icons - two
// unrelated component libraries. This package only exports which
// simple-icons export name (a string) applies to a kind; each app keeps
// its own tiny <BrandIcon> wrapper and its own fallback icon choice for
// kinds simple-icons has no mark for.

export type OAuthConnectorKind =
  | 'gdrive'
  | 'sharepoint'
  | 'onedrive'
  | 'confluence'
  | 'slack'
  | 'outlook'
  | 'teams'
  | 'gmail'
  | 'notion'
  | 'gsheets'
  | 'gcalendar'
  | 'jira'
  | 'github'
  | 'asana'
  | 'linear'
  | 'hubspot'
  | 'intercom'
  | 'pipedrive'
  | 'zendesk'
  | 'salesforce'

// StaticConnectorKind - authenticates with a single static secret (an API
// key pasted once) instead of an OAuth2 redirect flow. See
// seshat-server/internal/server/connectors/static_agent_account.go's
// staticAgentActionKinds - the source of truth this mirrors.
export type StaticConnectorKind =
  | 'stripe'
  | 'sendgrid'
  | 'mailgun'
  | 'postmark'
  | 'telegram'
  | 'discord'
  | 'trello'
  | 'airtable'

export type AnyConnectorKind = OAuthConnectorKind | StaticConnectorKind

// Canonical order - every "one card per kind" UI should map over this
// instead of hand-copying the 20 kind strings into its own array.
export const OAUTH_CONNECTOR_KINDS: OAuthConnectorKind[] = [
  'gdrive',
  'sharepoint',
  'onedrive',
  'confluence',
  'slack',
  'outlook',
  'teams',
  'gmail',
  'notion',
  'gsheets',
  'gcalendar',
  'jira',
  'github',
  'asana',
  'linear',
  'hubspot',
  'intercom',
  'pipedrive',
  'zendesk',
  'salesforce',
]

export const STATIC_CONNECTOR_KINDS: StaticConnectorKind[] = [
  'stripe',
  'sendgrid',
  'mailgun',
  'postmark',
  'telegram',
  'discord',
  'trello',
  'airtable',
]

// The 4 OAuth kinds that support knowledge_sync (Discover/Sync into a
// Knowledge corpus) - every other OAuth kind is agent_action-only,
// connected per-employee from Workspace → Connections instead.
export const KNOWLEDGE_SYNC_OAUTH_KINDS: OAuthConnectorKind[] = ['gdrive', 'sharepoint', 'onedrive', 'confluence']

// Kinds whose vendor has a genuine official MCP tool server to bridge a
// connected account's token/secret into - researched live and recorded
// in docs/helps/roadmap.md's "MCP Server Ledger" entry, not guessed.
// Everything else (Zendesk, Telegram, Discord, SendGrid, Mailgun,
// Postmark - despite Zendesk being a real OAuthConnectorKind for account
// registration) has no MCP server at all, preview or GA; the dataflow
// automation nodes built for each remain the only integration path.
export const MCP_BRIDGEABLE_OAUTH_KINDS: OAuthConnectorKind[] = [
  'gdrive',
  'sharepoint',
  'onedrive',
  'slack',
  'outlook',
  'teams',
  'gmail',
  'notion',
  'gsheets',
  'gcalendar',
  'jira',
  'confluence',
  'github',
  'asana',
  'linear',
  'hubspot',
  'intercom',
  'pipedrive',
  'salesforce',
]

// Static kinds whose vendor's MCP server takes a plain API key as a
// Bearer token instead of OAuth - bridged via StaticSecretForUser rather
// than AccessTokenForUser (see mcpregistry.Service.injectConnectorToken
// on the seshat-server side).
export const MCP_BRIDGEABLE_STATIC_KINDS: StaticConnectorKind[] = ['stripe', 'trello', 'airtable']

export const CONNECTOR_KIND_LABELS: Record<AnyConnectorKind, string> = {
  gdrive: 'Google Drive',
  sharepoint: 'SharePoint',
  onedrive: 'OneDrive',
  confluence: 'Confluence',
  slack: 'Slack',
  outlook: 'Outlook',
  teams: 'Microsoft Teams',
  gmail: 'Gmail',
  notion: 'Notion',
  gsheets: 'Google Sheets',
  gcalendar: 'Google Calendar',
  jira: 'Jira',
  github: 'GitHub',
  asana: 'Asana',
  linear: 'Linear',
  hubspot: 'HubSpot',
  intercom: 'Intercom',
  pipedrive: 'Pipedrive',
  zendesk: 'Zendesk',
  salesforce: 'Salesforce',
  stripe: 'Stripe',
  sendgrid: 'SendGrid',
  mailgun: 'Mailgun',
  postmark: 'Postmark',
  telegram: 'Telegram',
  discord: 'Discord',
  trello: 'Trello',
  airtable: 'Airtable',
}

// simple-icons export name (e.g. "siGoogledrive") for kinds that have a
// real vendor mark in that library - verified against its actual
// exports, not assumed. Absent from this map means simple-icons has no
// entry for that kind at all (Microsoft's own product sub-brands, plus a
// few SaaS vendors) - each app then falls back to its own icon library's
// closest existing glyph, never a fabricated logo.
export const CONNECTOR_KIND_SIMPLE_ICON: Partial<Record<AnyConnectorKind, string>> = {
  gdrive: 'siGoogledrive',
  confluence: 'siConfluence',
  gmail: 'siGmail',
  notion: 'siNotion',
  gsheets: 'siGooglesheets',
  gcalendar: 'siGooglecalendar',
  jira: 'siJira',
  github: 'siGithub',
  asana: 'siAsana',
  linear: 'siLinear',
  hubspot: 'siHubspot',
  intercom: 'siIntercom',
  zendesk: 'siZendesk',
  stripe: 'siStripe',
  mailgun: 'siMailgun',
  telegram: 'siTelegram',
  discord: 'siDiscord',
  trello: 'siTrello',
  airtable: 'siAirtable',
}

// outlook/teams/gmail are self-hosted by seshat-server itself
// (internal/server/msgraphmcp, internal/server/gmailmcp) - a relative
// path on that server's own origin, not an absolute vendor URL. Each
// consuming app prefixes this with its own known origin (seshat-console:
// window.location.origin; seshat-ui: left blank, no fixed origin to
// prefix from the desktop app - the admin fills it in manually).
export const SELF_HOSTED_MCP_PATH: Partial<Record<OAuthConnectorKind, string>> = {
  outlook: '/internal/mcp/outlook',
  teams: '/internal/mcp/teams',
  gmail: '/internal/mcp/gmail',
}

// Vendor-hosted remote MCP endpoints - each confirmed directly against
// the vendor's own docs (see docs/helps/roadmap.md's MCP Server Ledger),
// not guessed from a naming convention. Salesforce has no fixed URL (its
// Hosted MCP Server is provisioned per org via an External Client App)
// and is deliberately absent - the admin pastes their own.
export const VENDOR_HOSTED_MCP_URL: Partial<Record<AnyConnectorKind, string>> = {
  slack: 'https://mcp.slack.com/mcp',
  notion: 'https://mcp.notion.com/mcp',
  github: 'https://api.githubcopilot.com/mcp/',
  linear: 'https://mcp.linear.app/mcp',
  hubspot: 'https://mcp.hubspot.com',
  jira: 'https://mcp.atlassian.com/v2/mcp',
  confluence: 'https://mcp.atlassian.com/v2/mcp',
  asana: 'https://mcp.asana.com/v2/mcp',
  intercom: 'https://mcp.intercom.com/mcp',
  pipedrive: 'https://mcp.pipedrive.ai/mcp',
  stripe: 'https://mcp.stripe.com',
  trello: 'https://mcp.trello.com/v1',
  airtable: 'https://mcp.airtable.com/mcp',
}
