import { useState } from 'react'
import { AdminModal, AdminModalButton, AdminModalError, AdminModalField, adminInputClass } from '../shared/AdminModal'
import { createAdminMember, useAdminRoles } from './useAdminMemberships'

export function CreateMemberModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { roles } = useAdminRoles()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('member')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      await createAdminMember({ email, display_name: displayName || email, role })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to add this member.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal
      title="New member"
      onClose={onClose}
      footer={
        <>
          <AdminModalButton variant="cancel" onClick={onClose}>Cancel</AdminModalButton>
          <AdminModalButton disabled={submitting || !email.trim()} onClick={handleSubmit}>
            {submitting ? 'Adding…' : 'Add member'}
          </AdminModalButton>
        </>
      }
    >
      <AdminModalField label="Email">
        <input type="email" className={adminInputClass} value={email} autoFocus onChange={(e) => setEmail(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="Display name" hint="(optional)">
        <input type="text" className={adminInputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="Role">
        <select className={adminInputClass} value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
      </AdminModalField>
      <p className="text-[12px] text-[var(--text-muted)]">
        They&apos;ll get an email with a link to set their own password. Nobody here ever sees or sets it for them.
      </p>
      {error && <AdminModalError message={error} />}
    </AdminModal>
  )
}
