import { useState } from 'react'
import { AdminModal, AdminModalButton, AdminModalError, AdminModalField, adminInputClass } from '../shared/AdminModal'
import { useAdminMemberships, useAdminRoles } from '../users/useAdminMemberships'
import { useAdminTeams } from '../teams/useAdminTeams'
import { setAdminDesktopPolicyBinding } from './useAdminDesktopPolicies'
import type { DesktopPolicy } from '../types'

type SubjectType = 'org' | 'role' | 'user' | 'group'

export function NewBindingModal({ catalog, onClose, onSuccess }: { catalog: DesktopPolicy[]; onClose: () => void; onSuccess: () => void }) {
  const { roles } = useAdminRoles()
  const { teams } = useAdminTeams()
  const { memberships } = useAdminMemberships()

  const [policyCode, setPolicyCode] = useState(catalog[0]?.code ?? '')
  const [subjectType, setSubjectType] = useState<SubjectType>('org')
  const [subjectId, setSubjectId] = useState('')
  const [value, setValue] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function changeSubjectType(next: SubjectType) {
    setSubjectType(next)
    setSubjectId('')
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      await setAdminDesktopPolicyBinding({ policy_code: policyCode, subject_type: subjectType, subject_id: subjectType === 'org' ? '' : subjectId, value })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this binding.')
    } finally {
      setSubmitting(false)
    }
  }

  const needsSubject = subjectType !== 'org'
  const canSubmit = policyCode && (!needsSubject || subjectId)
  const selectedPolicy = catalog.find((p) => p.code === policyCode)

  return (
    <AdminModal
      title="New desktop policy binding"
      onClose={onClose}
      footer={
        <>
          <AdminModalButton variant="cancel" onClick={onClose}>Cancel</AdminModalButton>
          <AdminModalButton disabled={submitting || !canSubmit} onClick={handleSubmit}>{submitting ? 'Saving…' : 'Save'}</AdminModalButton>
        </>
      }
    >
      <AdminModalField label="Policy">
        <select className={adminInputClass} value={policyCode} onChange={(e) => setPolicyCode(e.target.value)}>
          {catalog.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}
        </select>
        {selectedPolicy && <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{selectedPolicy.admin_description}</p>}
      </AdminModalField>

      <AdminModalField label="Applies to">
        <select className={adminInputClass} value={subjectType} onChange={(e) => changeSubjectType(e.target.value as SubjectType)}>
          <option value="org">Whole organization</option>
          <option value="role">Role</option>
          <option value="user">User</option>
          <option value="group">Team</option>
        </select>
      </AdminModalField>

      {needsSubject && (
        <AdminModalField label="Subject">
          {subjectType === 'role' ? (
            <select className={adminInputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="" disabled>Select a role…</option>
              {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          ) : subjectType === 'group' ? (
            <select className={adminInputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="" disabled>Select a team…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <select className={adminInputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="" disabled>Select a user…</option>
              {memberships.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_display_name || m.user_email || m.user_id}</option>)}
            </select>
          )}
        </AdminModalField>
      )}

      <AdminModalField label="Value">
        <select className={adminInputClass} value={value ? 'allowed' : 'blocked'} onChange={(e) => setValue(e.target.value === 'allowed')}>
          <option value="allowed">Allowed</option>
          <option value="blocked">Blocked</option>
        </select>
        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
          Blocking here overrides a more permissive binding elsewhere - once anything applicable says blocked, it stays blocked.
        </p>
      </AdminModalField>

      {error && <AdminModalError message={error} />}
    </AdminModal>
  )
}
