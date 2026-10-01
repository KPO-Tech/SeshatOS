import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { AdminMCPServerConfig } from '../types'

export function useAdminMCPServerConfigs() {
  const [configs, setConfigs] = useState<AdminMCPServerConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ mcp_server_configs: AdminMCPServerConfig[] }>('/admin/mcp-server-configs')
      setConfigs(data?.mcp_server_configs ?? [])
    } catch (e: unknown) {
      setConfigs([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization MCP server configs.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { configs, loading, error, refetch }
}

export type AdminMCPServerConfigInput = {
  name?: string
  display_name?: string
  server_type: string
  command?: string
  args?: string[]
  url?: string
  timeout_secs?: number
  connector_kind?: string
}

export function createAdminMCPServerConfig(params: AdminMCPServerConfigInput): Promise<AdminMCPServerConfig> {
  return api.post('/admin/mcp-server-configs', params)
}

export function updateAdminMCPServerConfig(id: string, params: AdminMCPServerConfigInput): Promise<AdminMCPServerConfig> {
  return api.put(`/admin/mcp-server-configs/${id}`, params)
}

export function deleteAdminMCPServerConfig(id: string): Promise<void> {
  return api.delete(`/admin/mcp-server-configs/${id}`)
}
