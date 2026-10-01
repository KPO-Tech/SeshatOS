import {
  CONNECTOR_KIND_LABELS,
  OAUTH_CONNECTOR_KINDS,
  STATIC_CONNECTOR_KINDS,
  type AnyConnectorKind,
  type OAuthConnectorKind
} from '@seshat/connector-catalog'

export type PluginCategory = 'messaging' | 'files' | 'productivity' | 'crm' | 'payments'

export const PLUGIN_CATEGORIES: Array<{ id: PluginCategory; label: string }> = [
  { id: 'messaging', label: 'Messaging & email' },
  { id: 'files', label: 'Files & knowledge' },
  { id: 'productivity', label: 'Work management' },
  { id: 'crm', label: 'CRM & support' },
  { id: 'payments', label: 'Payments & delivery' }
]

// Where a plugin can be connected from. One plugin can offer several (Gmail
// is both a local inbox channel and an organization agent-action account).
export type PluginSource =
  // seshat-server, per employee: OAuth against the app the organization registered.
  | { type: 'cloud-oauth'; kind: OAuthConnectorKind }
  // seshat-server, per employee: a pasted API key.
  | { type: 'cloud-key'; kind: AnyConnectorKind }
  // seshat-backend inbox channel, OAuth, works on this device only.
  | { type: 'inbox-oauth'; channel: 'gmail' | 'outlook' | 'teams' }
  // seshat-backend inbox channel paired by scanning a QR code.
  | { type: 'whatsapp' }
  // Knowledge sources, set up in Config > Connectors.
  | { type: 'knowledge'; kind: 'gdrive' | 'sharepoint' | 's3' }

export type PluginDefinition = {
  id: string
  title: string
  description: string
  category: PluginCategory
  // Key into the brand-icon map; absent means the card draws a monogram.
  brand?: string
  sources: PluginSource[]
}

type Meta = { description: string; category: PluginCategory }

// One line per kind in the shared catalog: what it is for, and where it lives.
const KIND_META: Record<AnyConnectorKind, Meta> = {
  gdrive: { category: 'files', description: 'Let agents read your Drive files and sync documents into a knowledge base.' },
  sharepoint: { category: 'files', description: 'Sync Microsoft workspace documents and let agents search them.' },
  onedrive: { category: 'files', description: 'Give agents access to your OneDrive files and folders.' },
  confluence: { category: 'files', description: 'Search and sync Confluence pages into your knowledge base.' },
  notion: { category: 'files', description: 'Search workspace content, update notes and automate workflows in Notion.' },
  slack: { category: 'messaging', description: 'Read channels and post messages from your agents.' },
  outlook: { category: 'messaging', description: 'Read, search and reply to your Outlook mail.' },
  teams: { category: 'messaging', description: 'Read and reply to Microsoft Teams chats.' },
  gmail: { category: 'messaging', description: 'Draft replies, search your inbox and summarize email threads.' },
  telegram: { category: 'messaging', description: 'Send and receive Telegram messages through a bot.' },
  discord: { category: 'messaging', description: 'Post to Discord servers through a bot.' },
  gsheets: { category: 'productivity', description: 'Read and update Google Sheets from your agents.' },
  gcalendar: { category: 'productivity', description: 'Understand your schedule, create and manage events.' },
  jira: { category: 'productivity', description: 'Create, search and update Jira issues.' },
  github: { category: 'productivity', description: 'Manage repositories, track code changes and collaborate on pull requests.' },
  asana: { category: 'productivity', description: 'Create and track tasks and projects in Asana.' },
  linear: { category: 'productivity', description: 'Create, triage and update Linear issues.' },
  trello: { category: 'productivity', description: 'Manage Trello boards, lists and cards.' },
  airtable: { category: 'productivity', description: 'Read and write records in your Airtable bases.' },
  hubspot: { category: 'crm', description: 'Look up and update contacts, companies and deals.' },
  pipedrive: { category: 'crm', description: 'Track deals and contacts in Pipedrive.' },
  salesforce: { category: 'crm', description: 'Query and update Salesforce records.' },
  intercom: { category: 'crm', description: 'Read conversations and help answer customers in Intercom.' },
  zendesk: { category: 'crm', description: 'Triage and answer Zendesk support tickets.' },
  stripe: { category: 'payments', description: 'Look up customers, payments and subscriptions in Stripe.' },
  sendgrid: { category: 'payments', description: 'Send transactional email through SendGrid.' },
  mailgun: { category: 'payments', description: 'Send transactional email through Mailgun.' },
  postmark: { category: 'payments', description: 'Send transactional email through Postmark.' }
}

// Kinds that also exist as a local inbox channel on this device.
const INBOX_CHANNELS: Partial<Record<AnyConnectorKind, 'gmail' | 'outlook' | 'teams'>> = {
  gmail: 'gmail',
  outlook: 'outlook',
  teams: 'teams'
}

// Kinds that can be set up as a local knowledge source.
const KNOWLEDGE_KINDS: Partial<Record<AnyConnectorKind, 'gdrive' | 'sharepoint'>> = {
  gdrive: 'gdrive',
  sharepoint: 'sharepoint'
}

function definitionFor(kind: AnyConnectorKind, isOAuth: boolean): PluginDefinition {
  const sources: PluginSource[] = []
  const channel = INBOX_CHANNELS[kind]
  const knowledge = KNOWLEDGE_KINDS[kind]
  if (channel) sources.push({ type: 'inbox-oauth', channel })
  if (knowledge) sources.push({ type: 'knowledge', kind: knowledge })
  sources.push(isOAuth ? { type: 'cloud-oauth', kind: kind as OAuthConnectorKind } : { type: 'cloud-key', kind })
  return {
    id: kind,
    title: CONNECTOR_KIND_LABELS[kind],
    description: KIND_META[kind].description,
    category: KIND_META[kind].category,
    brand: kind,
    sources
  }
}

// Shown first within their category; the rest keep the shared catalog's order.
const FEATURED = ['gmail', 'whatsapp', 'slack', 'gdrive', 'notion', 'github', 'gcalendar', 'hubspot', 'stripe']

function byFeatured(a: PluginDefinition, b: PluginDefinition): number {
  const rank = (plugin: PluginDefinition) => (FEATURED.includes(plugin.id) ? FEATURED.indexOf(plugin.id) : FEATURED.length)
  return rank(a) - rank(b)
}

const ENTRIES: PluginDefinition[] = [
  ...OAUTH_CONNECTOR_KINDS.map((kind) => definitionFor(kind, true)),
  ...STATIC_CONNECTOR_KINDS.map((kind) => definitionFor(kind, false)),
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    description: 'Pair a WhatsApp account by scanning a QR code, then let the inbox agent read and reply.',
    category: 'messaging',
    brand: 'whatsapp',
    sources: [{ type: 'whatsapp' }]
  },
  {
    id: 's3',
    title: 'S3-compatible storage',
    description: 'Sync documents from AWS S3, MinIO, R2 or Backblaze buckets into your knowledge base.',
    category: 'files',
    sources: [{ type: 'knowledge', kind: 's3' }]
  }
]

export const PLUGIN_CATALOG: PluginDefinition[] = [...ENTRIES].sort(byFeatured)

// Sources reachable by this kind of account: the organization connectors need
// a Seshat Server; everything else runs on this device.
export function availableSources(plugin: PluginDefinition, organization: boolean): PluginSource[] {
  return plugin.sources.filter((source) => organization || (source.type !== 'cloud-oauth' && source.type !== 'cloud-key'))
}

// Plugins with at least one usable source for this kind of account.
export function pluginsFor(organization: boolean): PluginDefinition[] {
  return PLUGIN_CATALOG.filter((plugin) => availableSources(plugin, organization).length > 0)
}

export function matchesQuery(plugin: PluginDefinition, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return `${plugin.title} ${plugin.description}`.toLowerCase().includes(needle)
}
