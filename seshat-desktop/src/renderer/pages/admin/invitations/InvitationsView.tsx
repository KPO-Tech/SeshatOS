import { useState } from 'react'
import { CloseOne, Plus } from '@icon-park/react'
import { AdminBanner } from '../shared/AdminBanner'
import { AdminEmptyRow, AdminIconButton, AdminStatusBadge, AdminTable, AdminTd, AdminTh, AdminTr } from '../shared/AdminTable'
import { InviteModal } from './InviteModal'
import { revokeAdminInvitation, useAdminInvitations } from './useAdminInvitations'
import type { OrgInvitation } from '../types'

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'revoked', label: 'Revoked' },
  { id: 'expired', label: 'Expired' },
] as const

function statusTone(status: OrgInvitation['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'accepted') return 'success'
  if (status === 'pending') return 'warning'
  if (status === 'revoked' || status === 'expired') return 'danger'
  return 'neutral'
}

export function InvitationsView() {
  const [status, setStatus] = useState('')
  const { invitations, loading, error, refetch } = useAdminInvitations(status)
  const [inviting, setInviting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleRevoke(invitation: OrgInvitation) {
    if (revokingId) return
    if (!window.confirm(`Revoke the invitation sent to ${invitation.email}?`)) return
    setActionError(null)
    setRevokingId(invitation.id)
    try {
      await revokeAdminInvitation(invitation.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to revoke this invitation.')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md border border-[var(--border-soft)] p-0.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatus(f.id)}
              className={`cursor-pointer rounded-[5px] border-0 bg-transparent px-2.5 py-1 text-[12px] font-semibold ${
                status === f.id ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setInviting(true)}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-[var(--accent-primary)] px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"
        >
          <Plus size={13} /> Invite
        </button>
      </div>

      {(error || actionError) && <AdminBanner message={error || actionError || ''} onDismiss={() => setActionError(null)} />}

      <AdminTable head={<><AdminTh>Email</AdminTh><AdminTh>Role</AdminTh><AdminTh>Status</AdminTh><AdminTh>Invited</AdminTh><AdminTh>Expires</AdminTh><AdminTh /></>}>
        {loading ? (
          <AdminEmptyRow colSpan={6}>Loading…</AdminEmptyRow>
        ) : invitations.length === 0 ? (
          <AdminEmptyRow colSpan={6}>No invitations found</AdminEmptyRow>
        ) : (
          invitations.map((inv) => (
            <AdminTr key={inv.id}>
              <AdminTd>{inv.email}</AdminTd>
              <AdminTd mono muted>{inv.role}</AdminTd>
              <AdminTd><AdminStatusBadge tone={statusTone(inv.status)}>{inv.status}</AdminStatusBadge></AdminTd>
              <AdminTd muted>{new Date(inv.created_at).toLocaleDateString()}</AdminTd>
              <AdminTd muted>{inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '—'}</AdminTd>
              <AdminTd align="right">
                {inv.status === 'pending' && (
                  <AdminIconButton label="Revoke invitation" onClick={() => handleRevoke(inv)} disabled={revokingId === inv.id}>
                    <CloseOne size={14} />
                  </AdminIconButton>
                )}
              </AdminTd>
            </AdminTr>
          ))
        )}
      </AdminTable>

      {inviting && <InviteModal onClose={() => setInviting(false)} onSuccess={() => { setInviting(false); void refetch() }} />}
    </div>
  )
}
