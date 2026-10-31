import type { LocalConnector } from './api/localConnectorsApi'

const CATEGORY_LABELS: Record<string, string> = {
  messaging: 'Messaging & email',
  files: 'Files & knowledge',
  productivity: 'Work management',
  crm: 'CRM & support',
  payments: 'Payments & delivery'
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  messaging: 'Tools to send and read messages and email.',
  files: 'Tools to read, search and organize files and knowledge.',
  productivity: 'Tools to manage repositories, issues, documentation and collaboration.',
  crm: 'Tools to manage customers, deals and support.',
  payments: 'Tools to manage customers, payments and subscriptions.'
}

export function categoryDescription(category: string): string {
  return CATEGORY_DESCRIPTIONS[category] ?? 'Tools your agents can use.'
}

export function matchesQuery(connector: LocalConnector, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return `${connector.label} ${connector.description}`.toLowerCase().includes(needle)
}

export type ConnectorGroup = { id: string; label: string; connectors: LocalConnector[] }

// Connectors under their category, in the order the backend lists them. Only categories that have a connector appear.
export function groupConnectors(connectors: LocalConnector[]): ConnectorGroup[] {
  const groups: ConnectorGroup[] = []
  for (const connector of connectors) {
    const group = groups.find((item) => item.id === connector.category)
    if (group) group.connectors.push(connector)
    else groups.push({ id: connector.category, label: categoryLabel(connector.category), connectors: [connector] })
  }
  return groups
}
