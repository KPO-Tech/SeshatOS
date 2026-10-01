export type MCPServer = {
  id: string
  name: string
  display_name?: string
  server_type: 'stdio' | 'http' | 'sse' | 'ws' | string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  timeout_secs: number
  icon?: string
  enabled: boolean
  source?: string
  created_at?: number
  updated_at?: number
}

export type MCPServerFormValues = {
  name: string
  display_name: string
  server_type: string
  command: string
  args: string
  env: string
  url: string
  headers: string
  timeout_secs: number
  icon: string
}

export type MCPStatus = {
  name: string
  ok: boolean
  error?: string
  tools: number
  source?: string
}

export type MCPToolEntry = {
  name: string
  description?: string
}

export type MCPOrgCatalogEntry = {
  id: string
  name: string
  display_name?: string
  server_type: string
  command?: string
  args?: string[]
  url?: string
  icon?: string
  approved: boolean
}
