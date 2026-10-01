import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { DesktopPolicy, OrgDesktopPolicyBinding } from '../types'

// The fixed, code-defined catalog of what CAN be restricted - not
// organization data, fetched once.
export function useAdminDesktopPolicyCatalog() {
  const [catalog, setCatalog] = useState<DesktopPolicy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get<{ desktop_policies: DesktopPolicy[] }>('/admin/desktop-policies/catalog')
      .then((data) => { if (!cancelled) setCatalog(data?.desktop_policies ?? []) })
      .catch(() => { if (!cancelled) setCatalog([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { catalog, loading }
}

export function useAdminDesktopPolicyBindings() {
  const [bindings, setBindings] = useState<OrgDesktopPolicyBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ desktop_policy_bindings: OrgDesktopPolicyBinding[] }>('/admin/desktop-policy-bindings')
      setBindings(data?.desktop_policy_bindings ?? [])
    } catch (e: unknown) {
      setBindings([])
      setError((e as { message?: string })?.message ?? 'Failed to load desktop policy bindings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { bindings, loading, error, refetch }
}

export function setAdminDesktopPolicyBinding(params: { policy_code: string; subject_type: string; subject_id: string; value: boolean }): Promise<OrgDesktopPolicyBinding> {
  return api.post('/admin/desktop-policy-bindings', params)
}

export function deleteAdminDesktopPolicyBinding(id: string): Promise<void> {
  return api.delete(`/admin/desktop-policy-bindings/${id}`)
}
