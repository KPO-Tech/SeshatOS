import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { AuditPage } from '../types'

export const AUDIT_LIMIT = 50

export function useAdminAuditLogs(offset: number) {
  const [data, setData] = useState<AuditPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<AuditPage>(`/audit/logs?limit=${AUDIT_LIMIT}&offset=${offset}`)
      setData(res)
    } catch (e: unknown) {
      setData(null)
      setError((e as { message?: string })?.message ?? 'Failed to load audit logs.')
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}
