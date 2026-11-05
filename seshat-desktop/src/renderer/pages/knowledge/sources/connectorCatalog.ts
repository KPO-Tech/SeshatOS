import type { ConnectorDefinition } from './connectorTypes'

export const connectorCatalog: ConnectorDefinition[] = [
  {
    kind: 'gdrive',
    title: 'Google Drive',
    description: 'knowledge/sources:pages.knowledge.sources.connectorCatalog.gdrive',
    category: 'Knowledge',
    mode: 'oauth',
    oauthStartPath: '/knowledge/connectors/gdrive/oauth/start'
  },
  {
    kind: 'sharepoint',
    title: 'SharePoint',
    description: 'knowledge/sources:pages.knowledge.sources.connectorCatalog.sharepoint',
    category: 'Knowledge',
    mode: 'oauth',
    oauthStartPath: '/knowledge/connectors/sharepoint/oauth/start'
  },
  {
    kind: 's3',
    title: 'S3-compatible storage',
    description: 'knowledge/sources:pages.knowledge.sources.connectorCatalog.s3',
    category: 'Knowledge',
    mode: 'static'
  },
  {
    kind: 'mcp:demo-crm',
    title: 'Demo CRM',
    description: 'knowledge/sources:pages.knowledge.sources.connectorCatalog.demoCrm',
    category: 'Actions',
    mode: 'action'
  }
]
