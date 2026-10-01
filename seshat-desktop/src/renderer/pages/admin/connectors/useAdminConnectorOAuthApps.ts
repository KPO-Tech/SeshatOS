import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { ConnectorOAuthApp } from '../types'

export function useAdminConnectorOAuthApps() {
  const [apps, setApps] = useState<ConnectorOAuthApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ oauth_apps: ConnectorOAuthApp[] }>('/admin/connector-oauth-apps')
      setApps(data?.oauth_apps ?? [])
    } catch (e: unknown) {
      setApps([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization connector apps.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { apps, loading, error, refetch }
}

export function registerAdminConnectorOAuthApp(kind: string, params: { client_id: string; client_secret?: string; subdomain?: string }): Promise<ConnectorOAuthApp> {
  return api.put(`/admin/connector-oauth-apps/${encodeURIComponent(kind)}`, params)
}
