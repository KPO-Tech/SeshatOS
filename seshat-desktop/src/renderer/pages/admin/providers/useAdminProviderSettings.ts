import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { OrgProviderSetting } from '../types'

export function useAdminProviderSettings() {
  const [settings, setSettings] = useState<OrgProviderSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ provider_settings: OrgProviderSetting[] }>('/admin/provider-settings')
      setSettings(data?.provider_settings ?? [])
    } catch (e: unknown) {
      setSettings([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization provider settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { settings, loading, error, refetch }
}

export function createAdminProviderSetting(params: { provider: string; default_model?: string; base_url?: string; api_key: string }): Promise<OrgProviderSetting> {
  return api.post('/admin/provider-settings', params)
}

export function updateAdminProviderSetting(id: string, params: { default_model?: string; base_url?: string; api_key?: string }): Promise<OrgProviderSetting> {
  return api.put(`/admin/provider-settings/${id}`, params)
}

export function deleteAdminProviderSetting(id: string): Promise<void> {
  return api.delete(`/admin/provider-settings/${id}`)
}

export function setAdminProviderSettingDefault(id: string): Promise<OrgProviderSetting> {
  return api.post(`/admin/provider-settings/${id}/set-default`, {})
}

// The backend has always had this endpoint (admin_provider_settings.go) but
// the old build never exposed it - there was no way to un-mark a setting as
// the organization default once set.
export function unsetAdminProviderSettingDefault(id: string): Promise<OrgProviderSetting> {
  return api.post(`/admin/provider-settings/${id}/unset-default`, {})
}
