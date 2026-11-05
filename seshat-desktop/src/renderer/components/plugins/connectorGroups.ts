import type { TFunction } from 'i18next'
import type { LocalConnector } from './api/localConnectorsApi'

const CATEGORY_LABELS: Record<string, string> = {
  messaging: 'plugins:plugins.connectorGroups.messagingLabel',
  files: 'plugins:plugins.connectorGroups.filesLabel',
  productivity: 'plugins:plugins.connectorGroups.productivityLabel',
  crm: 'plugins:plugins.connectorGroups.crmLabel',
  payments: 'plugins:plugins.connectorGroups.paymentsLabel'
}

export function categoryLabel(category: string, t: TFunction): string {
  const key = CATEGORY_LABELS[category]
  return key ? t(key) : category.charAt(0).toUpperCase() + category.slice(1)
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  messaging: 'plugins:plugins.connectorGroups.messagingDescription',
  files: 'plugins:plugins.connectorGroups.filesDescription',
  productivity: 'plugins:plugins.connectorGroups.productivityDescription',
  crm: 'plugins:plugins.connectorGroups.crmDescription',
  payments: 'plugins:plugins.connectorGroups.paymentsDescription'
}

export function categoryDescription(category: string, t: TFunction): string {
  return t(CATEGORY_DESCRIPTIONS[category] ?? 'plugins:plugins.connectorGroups.defaultDescription')
}

export function matchesQuery(connector: LocalConnector, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return `${connector.label} ${connector.description}`.toLowerCase().includes(needle)
}

export type ConnectorGroup = { id: string; label: string; connectors: LocalConnector[] }

// Connectors under their category, in the order the backend lists them. Only categories that have a connector appear.
export function groupConnectors(connectors: LocalConnector[], t: TFunction): ConnectorGroup[] {
  const groups: ConnectorGroup[] = []
  for (const connector of connectors) {
    const group = groups.find((item) => item.id === connector.category)
    if (group) group.connectors.push(connector)
    else groups.push({ id: connector.category, label: categoryLabel(connector.category, t), connectors: [connector] })
  }
  return groups
}
