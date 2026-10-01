import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { OrgAgentPreset } from '../types'

export function useAdminAgentPresets() {
  const [presets, setPresets] = useState<OrgAgentPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ agent_presets: OrgAgentPreset[] }>('/admin/agent-presets')
      setPresets(data?.agent_presets ?? [])
    } catch (e: unknown) {
      setPresets([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization agent presets.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { presets, loading, error, refetch }
}

export type AgentPresetInput = {
  slug?: string
  name?: string
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
  enabled?: boolean
}

export function createAdminAgentPreset(params: AgentPresetInput): Promise<OrgAgentPreset> {
  return api.post('/admin/agent-presets', params)
}

export function updateAdminAgentPreset(id: string, params: AgentPresetInput): Promise<OrgAgentPreset> {
  return api.put(`/admin/agent-presets/${id}`, params)
}

export function deleteAdminAgentPreset(id: string): Promise<void> {
  return api.delete(`/admin/agent-presets/${id}`)
}
