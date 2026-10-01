import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { AdminWebSearchOrgPolicy } from '../types'

export function useAdminWebSearchPolicy() {
  const [policy, setPolicy] = useState<AdminWebSearchOrgPolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<AdminWebSearchOrgPolicy>('/admin/web-search-org-policy')
      setPolicy(data ?? { allowed_domains: [], blocked_domains: [] })
    } catch (e: unknown) {
      setPolicy(null)
      setError((e as { message?: string })?.message ?? 'Failed to load the organization web search policy.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { policy, loading, error, refetch }
}

export function updateAdminWebSearchPolicy(params: AdminWebSearchOrgPolicy): Promise<AdminWebSearchOrgPolicy> {
  return api.put('/admin/web-search-org-policy', params)
}
