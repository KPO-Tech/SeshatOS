import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { OrgTeam } from '../types'

export function useAdminTeams() {
  const [teams, setTeams] = useState<OrgTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ teams: OrgTeam[] }>('/admin/teams')
      setTeams(data?.teams ?? [])
    } catch (e: unknown) {
      setTeams([])
      setError((e as { message?: string })?.message ?? 'Failed to load organization teams.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { teams, loading, error, refetch }
}

export type AdminTeamInput = { name: string; slug: string; description?: string; member_user_ids?: string[] }

export function createAdminTeam(params: AdminTeamInput): Promise<OrgTeam> {
  return api.post('/admin/teams', params)
}

export function updateAdminTeam(id: string, params: AdminTeamInput): Promise<OrgTeam> {
  return api.put(`/admin/teams/${id}`, params)
}

export function deleteAdminTeam(id: string): Promise<void> {
  return api.delete(`/admin/teams/${id}`)
}
