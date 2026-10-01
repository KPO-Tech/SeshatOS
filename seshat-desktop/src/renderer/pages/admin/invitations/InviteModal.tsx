import { SendEmail } from '@icon-park/react'
import { useState } from 'react'
import { AdminModal, AdminModalButton, AdminModalError, AdminModalField, adminInputClass } from '../shared/AdminModal'
import { useAdminRoles } from '../users/useAdminMemberships'
import { createAdminInvitation } from './useAdminInvitations'

export function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { roles } = useAdminRoles()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [expiresInDays, setExpiresInDays] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const days = Number(expiresInDays)
      await createAdminInvitation({ email, role, ...(days > 0 ? { expires_in_days: days } : {}) })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to send this invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal
      title={<><SendEmail size={15} /> Invite a member</>}
      onClose={onClose}
      footer={
        <>
          <AdminModalButton variant="cancel" onClick={onClose}>Cancel</AdminModalButton>
          <AdminModalButton disabled={submitting || !email.trim()} onClick={handleSubmit}>
            {submitting ? 'Sending…' : 'Send invitation'}
          </AdminModalButton>
        </>
      }
    >
      <AdminModalField label="Email">
        <input type="email" className={adminInputClass} value={email} autoFocus onChange={(e) => setEmail(e.target.value)} />
      </AdminModalField>
      <AdminModalField label="Role">
        <select className={adminInputClass} value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
      </AdminModalField>
      <AdminModalField label="Expires in" hint="(days, optional)">
        <input type="number" min={1} placeholder="7" className={adminInputClass} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
      </AdminModalField>
      <p className="text-[12px] text-[var(--text-muted)]">They&apos;ll get an email with a link to accept and set their own password.</p>
      {error && <AdminModalError message={error} />}
    </AdminModal>
  )
}
