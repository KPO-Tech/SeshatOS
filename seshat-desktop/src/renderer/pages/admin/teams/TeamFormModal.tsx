import { useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/api/client'
import { AdminModal, AdminModalButton, AdminModalError, AdminModalField, adminInputClass } from '../shared/AdminModal'
import { createAdminTeam, updateAdminTeam } from './useAdminTeams'
import type { OrgMembership, OrgTeam } from '../types'

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function TeamFormModal({ team, onClose, onSuccess }: { team: OrgTeam | null; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(team?.name ?? '')
  const [slug, setSlug] = useState(team?.slug ?? '')
  // Slug follows Name while creating, until the admin edits Slug directly -
  // never while editing an existing team, whose slug may already be
  // referenced elsewhere.
  const [slugTouched, setSlugTouched] = useState(Boolean(team))
  const [description, setDescription] = useState(team?.description ?? '')
  const [memberIds, setMemberIds] = useState<string[]>(team?.member_user_ids ?? [])
  const [memberSearch, setMemberSearch] = useState('')
  const [members, setMembers] = useState<OrgMembership[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ memberships: OrgMembership[] }>('/admin/memberships')
      .then((data) => setMembers(data?.memberships ?? []))
      .catch(() => setMembers([]))
  }, [])

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.user_email?.toLowerCase().includes(q) || m.user_display_name?.toLowerCase().includes(q))
  }, [members, memberSearch])

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const params = { name, slug, description, member_user_ids: memberIds }
      if (team) await updateAdminTeam(team.id, params)
      else await createAdminTeam(params)
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this team.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal
      title={team ? `Edit ${team.name}` : 'New team'}
      onClose={onClose}
      footer={
        <>
          <AdminModalButton variant="cancel" onClick={onClose}>Cancel</AdminModalButton>
          <AdminModalButton disabled={submitting || !name.trim() || !slug.trim()} onClick={handleSubmit}>
            {submitting ? 'Saving…' : 'Save'}
          </AdminModalButton>
        </>
      }
    >
      <AdminModalField label="Name">
        <input
          type="text"
          className={adminInputClass}
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value)
            if (!slugTouched) setSlug(slugify(e.target.value))
          }}
        />
      </AdminModalField>

      <AdminModalField label="Slug">
        <input
          type="text"
          className={adminInputClass}
          placeholder="lowercase-with-hyphens"
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugTouched(true) }}
        />
      </AdminModalField>

      <AdminModalField label="Description" hint="(optional)">
        <textarea
          className={adminInputClass}
          rows={2}
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </AdminModalField>

      <AdminModalField label="Members">
        <input
          type="text"
          className={`${adminInputClass} mb-2`}
          placeholder="Search members…"
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
        />
        <div className="max-h-[180px] overflow-y-auto rounded-md border border-[var(--border-soft)]">
          {filteredMembers.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-[var(--text-muted)]">No members found</div>
          ) : (
            filteredMembers.map((m) => (
              <label key={m.user_id} className="flex cursor-pointer items-center gap-2.5 border-b border-[var(--border-soft)] px-3 py-2 text-[13px] last:border-0 hover:bg-[var(--surface-hover)]">
                <input type="checkbox" checked={memberIds.includes(m.user_id)} onChange={() => toggleMember(m.user_id)} />
                <span className="text-[var(--text-primary)]">{m.user_display_name || m.user_email}</span>
                <span className="ml-auto font-mono text-[11px] text-[var(--text-muted)]">{m.user_email}</span>
              </label>
            ))
          )}
        </div>
      </AdminModalField>

      {error && <AdminModalError message={error} />}
    </AdminModal>
  )
}
