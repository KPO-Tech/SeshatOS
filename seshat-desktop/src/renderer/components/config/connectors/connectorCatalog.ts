import type { ConnectorDefinition } from './connectorTypes'

export const connectorCatalog: ConnectorDefinition[] = [
  {
    kind: 'gdrive',
    title: 'Google Drive',
    description: 'Sync documents from Drive into a knowledge corpus.',
    category: 'Knowledge',
    mode: 'oauth',
    oauthStartPath: '/knowledge/connectors/gdrive/oauth/start'
  },
  {
    kind: 'sharepoint',
    title: 'SharePoint',
    description: 'Sync Microsoft workspace documents into knowledge.',
    category: 'Knowledge',
    mode: 'oauth',
    oauthStartPath: '/knowledge/connectors/sharepoint/oauth/start'
  },
  {
    kind: 's3',
    title: 'S3-compatible storage',
    description: 'Connect AWS S3, MinIO, R2, or Backblaze buckets.',
    category: 'Knowledge',
    mode: 'static'
  },
  {
    kind: 'mcp:demo-crm',
    title: 'Demo CRM',
    description: 'Action connector backed by the MCP action bridge.',
    category: 'Actions',
    mode: 'action'
  }
]
