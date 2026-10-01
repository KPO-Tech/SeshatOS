import { Peoples, SendEmail, User } from '@icon-park/react'
import type { ReactNode } from 'react'
import { useAdminTeams } from '../teams/useAdminTeams'
import { useAdminMemberships } from '../users/useAdminMemberships'
import { useAdminInvitations } from '../invitations/useAdminInvitations'

// A lightweight dashboard for what's built so far - members/teams/pending
// invitations. Grows as the remaining sub-features (providers, policies,
// connectors, jobs/devices) land.
export function OverviewView() {
  const { memberships, loading: loadingMembers } = useAdminMemberships()
  const { teams, loading: loadingTeams } = useAdminTeams()
  const { invitations, loading: loadingInvitations } = useAdminInvitations('pending')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 text-[17px] font-semibold text-[var(--text-primary)]">Overview</div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<User size={16} />} label="Members" value={loadingMembers ? '—' : memberships.length} />
        <StatCard icon={<Peoples size={16} />} label="Teams" value={loadingTeams ? '—' : teams.length} />
        <StatCard icon={<SendEmail size={16} />} label="Pending invitations" value={loadingInvitations ? '—' : invitations.length} />
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="mb-3 flex size-8 items-center justify-center rounded-md bg-[var(--accent-subtle)] text-[var(--accent-primary)]">{icon}</div>
      <div className="text-[22px] font-semibold text-[var(--text-primary)]">{value}</div>
      <div className="text-[12px] text-[var(--text-muted)]">{label}</div>
    </div>
  )
}
