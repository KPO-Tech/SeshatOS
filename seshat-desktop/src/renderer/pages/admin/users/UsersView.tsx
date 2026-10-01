import { useState } from 'react'
import { Delete, User } from '@icon-park/react'
import { useAuthStore } from '@renderer/stores/auth'
import { AdminBanner } from '../shared/AdminBanner'
import { AdminPageHeader } from '../shared/AdminPageHeader'
import { AdminEmptyRow, AdminIconButton, AdminStatusBadge, AdminTable, AdminTd, AdminTh, AdminTr } from '../shared/AdminTable'
import { adminInputClass } from '../shared/AdminModal'
import { CreateMemberModal } from './CreateMemberModal'
import { deleteAdminMembership, updateAdminMembershipRole, useAdminMemberships, useAdminRoles } from './useAdminMemberships'
import type { OrgMembership } from '../types'

export function UsersView() {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const { memberships, loading, error, refetch } = useAdminMemberships()
  const { roles } = useAdminRoles()
  const [creating, setCreating] = useState(false)
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const roleByCode = new Map(roles.map((r) => [r.code, r]))

  async function handleRoleChange(membership: OrgMembership, role: string) {
    if (savingRoleId) return
    setActionError(null)
    setSavingRoleId(membership.id)
    try {
      await updateAdminMembershipRole(membership.id, role)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? "Failed to update this member's role.")
    } finally {
      setSavingRoleId(null)
    }
  }

  async function handleRemove(membership: OrgMembership) {
    if (deletingId) return
    const label = membership.user_display_name || membership.user_email || membership.user_id
    if (!window.confirm(`Remove ${label} from this organization? This cannot be undone.`)) return
    setActionError(null)
    setDeletingId(membership.id)
    try {
      await deleteAdminMembership(membership.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to remove this member.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AdminPageHeader title="Users" actionLabel="New member" onAction={() => setCreating(true)} />
      {(error || actionError) && <AdminBanner message={error || actionError || ''} onDismiss={() => setActionError(null)} />}

      <AdminTable
        head={<><AdminTh>Member</AdminTh><AdminTh>Email</AdminTh><AdminTh>Role</AdminTh><AdminTh>Status</AdminTh><AdminTh>Joined</AdminTh><AdminTh /></>}
      >
        {loading ? (
          <AdminEmptyRow colSpan={6}>Loading…</AdminEmptyRow>
        ) : memberships.length === 0 ? (
          <AdminEmptyRow colSpan={6}>No members found</AdminEmptyRow>
        ) : (
          memberships.map((m) => (
            <AdminTr key={m.id}>
              <AdminTd>
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]"><User size={12} /></span>
                  <span className="font-medium text-[var(--text-primary)]">{m.user_display_name || '—'}</span>
                </div>
              </AdminTd>
              <AdminTd muted mono>{m.user_email || '—'}</AdminTd>
              <AdminTd>
                <select
                  className={`${adminInputClass} w-auto py-1`}
                  value={m.role}
                  disabled={savingRoleId === m.id || m.user_id === currentUserId}
                  onChange={(e) => handleRoleChange(m, e.target.value)}
                >
                  {!roleByCode.has(m.role) && <option value={m.role}>{m.role}</option>}
                  {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
              </AdminTd>
              <AdminTd>
                <AdminStatusBadge tone={m.status === 'active' ? 'success' : 'neutral'}>{m.status}</AdminStatusBadge>
              </AdminTd>
              <AdminTd muted>{new Date(m.created_at).toLocaleDateString()}</AdminTd>
              <AdminTd align="right">
                <AdminIconButton
                  label="Remove from organization"
                  onClick={() => handleRemove(m)}
                  disabled={deletingId === m.id || m.user_id === currentUserId}
                >
                  <Delete size={14} />
                </AdminIconButton>
              </AdminTd>
            </AdminTr>
          ))
        )}
      </AdminTable>

      {creating && <CreateMemberModal onClose={() => setCreating(false)} onSuccess={() => { setCreating(false); void refetch() }} />}
    </div>
  )
}
