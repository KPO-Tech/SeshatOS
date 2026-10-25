import { api } from '@renderer/api/client'
import type { AgentConfigEntry, AgentCreatePayload, AgentsResponse } from './agentTypes'

export async function fetchAgents() {
  const result = await api.get<AgentsResponse>('/agents')
  return result.agents ?? []
}

export function createAgent(payload: AgentCreatePayload) {
  return api.post<AgentConfigEntry>('/agents', payload)
}

export function updateAgent(slug: string, payload: Partial<AgentConfigEntry>) {
  return api.put<AgentConfigEntry>(`/agents/${encodeURIComponent(slug)}`, payload)
}

export function deleteAgent(slug: string) {
  return api.delete(`/agents/${encodeURIComponent(slug)}`)
}
