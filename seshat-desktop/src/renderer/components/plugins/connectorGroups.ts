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
