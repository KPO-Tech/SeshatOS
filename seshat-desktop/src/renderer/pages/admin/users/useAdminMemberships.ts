import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { OrgMembership, OrgRole } from '../types'

export function useAdminMemberships() {
  const [memberships, setMemberships] = useState<OrgMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ memberships: OrgMembership[] }>('/admin/memberships')
      setMemberships(data?.memberships ?? [])
    } catch (e: unknown) {
      setMemberships([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization members.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { memberships, loading, error, refetch }
}

// Read-only role catalog for the role picker (built-in member/admin plus
// any custom roles already defined in seshat-console).
export function useAdminRoles() {
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get<{ roles: OrgRole[] }>('/admin/roles')
      .then((data) => { if (!cancelled) setRoles(data?.roles ?? []) })
      .catch(() => { if (!cancelled) setRoles([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { roles, loading }
}

export function createAdminMember(params: { email: string; display_name: string; role: string }): Promise<OrgMembership> {
  return api.post('/admin/memberships', params)
}

export function updateAdminMembershipRole(id: string, role: string): Promise<OrgMembership> {
  return api.put(`/admin/memberships/${id}`, { role })
}

export function deleteAdminMembership(id: string): Promise<void> {
  return api.delete(`/admin/memberships/${id}`)
}
