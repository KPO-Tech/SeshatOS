import type { User } from '@renderer/api/types'
import { AccountLine, Avatar, formatStatus, initialsFor, LogoutIcon, MetricRow, Panel, SectionDivider } from './SettingsPrimitives'

type Props = {
  user: User
  displayName: string
  onLogout: () => void
}

export function AccountSettings({ user, displayName, onLogout }: Props) {
  return (
    <Panel title="Account">
      <div className="max-w-[820px] space-y-5">
        <section className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar initials={initialsFor(displayName)} size="lg" />
            <label className="grid min-w-0 gap-1.5">
              <span className="text-[13px] font-semibold text-[var(--text-muted)]">Full name</span>
              <input
                value={displayName}
                readOnly
                className="h-10 w-[300px] rounded-md border border-transparent bg-[var(--surface-panel)] px-3 text-[14px] font-semibold text-[var(--text-primary)] outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            aria-label="Sign out"
          >
            <LogoutIcon />
          </button>
        </section>

        <section className="rounded-lg border border-[var(--border-soft)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[19px] font-semibold text-[var(--text-primary)]">Local</h2>
            <span className="rounded-md bg-[var(--surface-panel)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)]">
              Desktop
            </span>
          </div>
          <div className="my-4 border-t border-dashed border-[var(--border-soft)]" />
          <MetricRow icon="spark" title="Workspace status" description="Local Seshat workspace" value={formatStatus(user.status)} />
          <MetricRow icon="database" title="Session storage" description="Secure storage when available" value="Ready" />
        </section>

        <section className="grid gap-4">
          <AccountLine title="Email" value={user.email} action="Change" />
          <AccountLine title="User ID" value={user.id} action="Copy" onAction={() => void navigator.clipboard?.writeText(user.id)} />
        </section>

        <SectionDivider />

        <section className="grid gap-4">
          <AccountLine title="Manage sign-in methods" value="Manage local and connected sign-in options." action="Manage" />
          <div className="flex items-center justify-between gap-8">
            <div>
              <div className="text-[14px] font-semibold text-[var(--text-primary)]">Delete account</div>
              <div className="mt-1 text-[13px] text-[var(--text-muted)]">This will be implemented after account data policies are finalized.</div>
            </div>
            <button type="button" className="rounded-md border border-[var(--accent-danger)] px-3 py-1.5 text-[13px] font-semibold text-[var(--accent-danger)] hover:bg-[var(--surface-muted)]">
              Delete account
            </button>
          </div>
        </section>
      </div>
    </Panel>
  )
}
