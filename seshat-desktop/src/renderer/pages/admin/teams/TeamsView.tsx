import { useState } from 'react'
import { Delete, Edit } from '@icon-park/react'
import { AdminBanner } from '../shared/AdminBanner'
import { AdminPageHeader } from '../shared/AdminPageHeader'
import { AdminEmptyRow, AdminIconButton, AdminTable, AdminTd, AdminTh, AdminTr } from '../shared/AdminTable'
import { TeamFormModal } from './TeamFormModal'
import { deleteAdminTeam, useAdminTeams } from './useAdminTeams'
import type { OrgTeam } from '../types'

export function TeamsView() {
  const { teams, loading, error, refetch } = useAdminTeams()
  const [editing, setEditing] = useState<OrgTeam | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(team: OrgTeam) {
    if (deletingId) return
    if (!window.confirm(`Delete team "${team.name}"? This cannot be undone.`)) return
    setActionError(null)
    setDeletingId(team.id)
    try {
      await deleteAdminTeam(team.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to delete this team.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AdminPageHeader title="Teams" actionLabel="New team" onAction={() => setEditing('new')} />
      {(error || actionError) && <AdminBanner message={error || actionError || ''} onDismiss={() => setActionError(null)} />}

      <AdminTable head={<><AdminTh>Team</AdminTh><AdminTh>Members</AdminTh><AdminTh /></>}>
        {loading ? (
          <AdminEmptyRow colSpan={3}>Loading…</AdminEmptyRow>
        ) : teams.length === 0 ? (
          <AdminEmptyRow colSpan={3}>No teams yet</AdminEmptyRow>
        ) : (
          teams.map((team) => (
            <AdminTr key={team.id}>
              <AdminTd>
                <div className="font-semibold text-[var(--text-primary)]">{team.name}</div>
                <div className="font-mono text-[11px] text-[var(--text-muted)]">{team.slug}</div>
              </AdminTd>
              <AdminTd muted>{team.member_user_ids?.length ?? 0}</AdminTd>
              <AdminTd align="right">
                <div className="flex justify-end gap-1">
                  <AdminIconButton label="Edit" onClick={() => setEditing(team)}><Edit size={14} /></AdminIconButton>
                  <AdminIconButton label="Delete" onClick={() => handleDelete(team)} disabled={deletingId === team.id}><Delete size={14} /></AdminIconButton>
                </div>
              </AdminTd>
            </AdminTr>
          ))
        )}
      </AdminTable>

      {editing && (
        <TeamFormModal
          team={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); void refetch() }}
        />
      )}
    </div>
  )
}
