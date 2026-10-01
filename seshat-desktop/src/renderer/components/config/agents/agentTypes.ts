export type AgentSource = 'built-in' | 'user' | 'workflow' | 'organization' | string

export type AgentConfigEntry = {
  id?: string
  slug: string
  name: string
  when_to_use?: string
  system_prompt?: string
  model?: string
  tools?: string[]
  disallowed_tools?: string[]
  max_turns?: number
  permission_mode?: string
  isolation?: string
  mcp_servers?: string[]
  icon?: string
  enabled: boolean
  source: AgentSource
  created_at?: number
  updated_at?: number
}

export type AgentsResponse = {
  agents: AgentConfigEntry[]
  count: number
}

export type AgentCreatePayload = {
  slug: string
  name: string
  when_to_use: string
  system_prompt: string
  model?: string
  tools?: string[]
  disallowed_tools?: string[]
  max_turns?: number
  permission_mode?: string
  isolation?: string
  mcp_servers?: string[]
  icon?: string
  enabled?: boolean
}
