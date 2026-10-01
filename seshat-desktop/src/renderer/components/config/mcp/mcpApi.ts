import { api } from '@renderer/api/client'
import type { MCPOrgCatalogEntry, MCPServer, MCPStatus, MCPToolEntry } from './mcpTypes'

export async function fetchMCPServers() {
  const result = await api.get<{ servers: MCPServer[]; count: number }>('/mcp/config')
  return result.servers ?? []
}

export async function fetchMCPTools() {
  const result = await api.get<{ tools: Record<string, MCPToolEntry[]> }>('/mcp/tools')
  return result.tools ?? {}
}

export function createMCPServer(params: Partial<MCPServer>) {
  return api.post<MCPServer>('/mcp/config', params)
}

export function updateMCPServer(id: string, params: Partial<MCPServer>) {
  return api.put<MCPServer>(`/mcp/config/${id}`, params)
}

export function deleteMCPServer(id: string) {
  return api.delete(`/mcp/config/${id}`)
}

export function importMCPJson(payload?: unknown) {
  return api.post<{ imported: number; message: string }>('/mcp/config/import-json', payload)
}

export function reloadMCPServers() {
  return api.post<{ reloaded: number; servers: MCPStatus[] }>('/mcp/reload', {})
}

export async function fetchMCPOrgCatalog() {
  const result = await api.get<{ mcp_org_catalog: MCPOrgCatalogEntry[]; count: number }>('/mcp/org-catalog')
  return result.mcp_org_catalog ?? []
}

export function approveMCPOrgServer(id: string) {
  return api.post(`/mcp/org-catalog/${id}/approve`, {})
}

export function revokeMCPOrgServer(id: string) {
  return api.delete(`/mcp/org-catalog/${id}/approve`)
}
