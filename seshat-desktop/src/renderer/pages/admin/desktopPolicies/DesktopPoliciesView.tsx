import { useState } from 'react'
import { Delete } from '@icon-park/react'
import { AdminBanner } from '../shared/AdminBanner'
import { AdminPageHeader } from '../shared/AdminPageHeader'
import { AdminEmptyRow, AdminIconButton, AdminStatusBadge, AdminTable, AdminTd, AdminTh, AdminTr } from '../shared/AdminTable'
import { NewBindingModal } from './NewBindingModal'
import { deleteAdminDesktopPolicyBinding, useAdminDesktopPolicyBindings, useAdminDesktopPolicyCatalog } from './useAdminDesktopPolicies'
import type { OrgDesktopPolicyBinding } from '../types'

// "group" is the wire value (matches seshat-server's SubjectType enum) -
// labeled "Team" everywhere in the UI.
const SUBJECT_TYPE_LABELS: Record<string, string> = { org: 'Whole organization', role: 'Role', user: 'User', group: 'Team' }

export function DesktopPoliciesView() {
  const { catalog, loading: catalogLoading } = useAdminDesktopPolicyCatalog()
  const { bindings, loading, error, refetch } = useAdminDesktopPolicyBindings()
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const catalogByCode = new Map(catalog.map((p) => [p.code, p]))

  async function handleDelete(binding: OrgDesktopPolicyBinding) {
    if (deletingId) return
    if (!window.confirm('Remove this binding? The affected subject falls back to whatever else applies, or the catalog default.')) return
    setActionError(null)
    setDeletingId(binding.id)
    try {
      await deleteAdminDesktopPolicyBinding(binding.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to remove this binding.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AdminPageHeader title="Desktop Policies" actionLabel="New binding" onAction={() => setCreating(true)} />
      <p className="mb-4 text-[12px] text-[var(--text-muted)]">
        Restrict what the desktop app allows on a device - custom providers, local models, multiple workspaces, and settings changes.
        Every policy is allowed by default; a binding can only restrict further, never loosen it.
      </p>

      <div className="mb-4 max-h-[180px] overflow-y-auto rounded-lg border border-[var(--border-soft)]">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-muted)]">
              <AdminTh>Code</AdminTh>
              <AdminTh>What it controls</AdminTh>
              <AdminTh>Message when blocked</AdminTh>
            </tr>
          </thead>
          <tbody>
            {catalogLoading ? (
              <AdminEmptyRow colSpan={3}>Loading…</AdminEmptyRow>
            ) : (
              catalog.map((p) => (
                <AdminTr key={p.code}>
                  <AdminTd mono>{p.code}</AdminTd>
                  <AdminTd>{p.admin_description}</AdminTd>
                  <AdminTd muted>{p.user_blocked_message}</AdminTd>
                </AdminTr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(error || actionError) && <AdminBanner message={error || actionError || ''} onDismiss={() => setActionError(null)} />}

      <AdminTable head={<><AdminTh>Policy</AdminTh><AdminTh>Applies to</AdminTh><AdminTh>Value</AdminTh><AdminTh /></>}>
        {loading ? (
          <AdminEmptyRow colSpan={4}>Loading…</AdminEmptyRow>
        ) : bindings.length === 0 ? (
          <AdminEmptyRow colSpan={4}>No bindings yet - every policy is at its default (allowed)</AdminEmptyRow>
        ) : (
          bindings.map((b) => (
            <AdminTr key={b.id}>
              <AdminTd>
                <div className="font-semibold text-[var(--text-primary)]">{b.policy_code}</div>
                {catalogByCode.get(b.policy_code) && <div className="text-[10px] text-[var(--text-muted)]">{catalogByCode.get(b.policy_code)!.admin_description}</div>}
              </AdminTd>
              <AdminTd>
                <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                  {SUBJECT_TYPE_LABELS[b.subject_type] ?? b.subject_type}
                </span>
                {b.subject_id && <span className="ml-1.5 font-mono text-[11px] text-[var(--text-muted)]">{b.subject_id}</span>}
              </AdminTd>
              <AdminTd><AdminStatusBadge tone={b.value ? 'success' : 'danger'}>{b.value ? 'Allowed' : 'Blocked'}</AdminStatusBadge></AdminTd>
              <AdminTd align="right">
                <AdminIconButton label="Delete" onClick={() => handleDelete(b)} disabled={deletingId === b.id}><Delete size={14} /></AdminIconButton>
              </AdminTd>
            </AdminTr>
          ))
        )}
      </AdminTable>

      {creating && <NewBindingModal catalog={catalog} onClose={() => setCreating(false)} onSuccess={() => { setCreating(false); void refetch() }} />}
    </div>
  )
}
