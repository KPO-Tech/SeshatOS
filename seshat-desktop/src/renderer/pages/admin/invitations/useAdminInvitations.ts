import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { OrgInvitation } from '../types'

export function useAdminInvitations(status: string) {
  const [invitations, setInvitations] = useState<OrgInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : ''
      const data = await api.get<{ invitations: OrgInvitation[] }>(`/admin/invitations${query}`)
      setInvitations(data?.invitations ?? [])
    } catch (e: unknown) {
      setInvitations([])
      setError((e as { message?: string })?.message ?? 'Failed to load invitations.')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { invitations, loading, error, refetch }
}

export function createAdminInvitation(params: { email: string; role: string; expires_in_days?: number }): Promise<OrgInvitation> {
  return api.post('/admin/invitations', params)
}

export function revokeAdminInvitation(id: string): Promise<void> {
  return api.post(`/admin/invitations/${id}/revoke`)
}
