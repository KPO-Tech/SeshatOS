export type Corpus = {
  id: string
  name: string
  file_count?: number
  chunk_count?: number
}

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

export type ConnectorKind = 'gdrive' | 'sharepoint' | 's3' | 'mcp:demo-crm'

export type ConnectorDefinition = {
  kind: ConnectorKind
  title: string
  description: string
  category: 'Knowledge' | 'Actions'
  mode: 'oauth' | 'static' | 'action'
  accountPathKind?: string
  oauthStartPath?: string
  syncPathKind?: string
}

export type ConnectAccountPayload = {
  display_name: string
  external_account_id: string
  access_token: string
  refresh_token?: string
  config?: Record<string, string>
}

export type ConnectorActionResult = {
  Success?: boolean
  success?: boolean
  Message?: string
  message?: string
  Data?: Record<string, unknown>
  data?: Record<string, unknown>
}
