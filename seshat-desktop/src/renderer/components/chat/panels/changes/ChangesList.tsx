import { Dropdown } from '@renderer/components/ui/Dropdown'
import { pullStatus, pullStatusLabel, pullSubtitle, type PullRequest, type PullState, type PullStatus } from '@renderer/lib/pullRequests'
import { useTranslation } from 'react-i18next'

const STATUS_COLOR: Record<PullStatus, string> = {
  running: 'text-[var(--accent-warning)] animate-pulse',
  ready: 'text-[var(--accent-success)]',
  failing: 'text-[var(--accent-danger)]',
  waiting: 'text-[var(--accent-warning)]',
  draft: 'text-[var(--text-muted)]',
  merged: 'text-[var(--accent-info)]',
  closed: 'text-[var(--text-muted)]'
}

type Props = {
  pulls: PullRequest[]
  onRefresh: () => void
  // The merge actions, left out where the agent cannot be asked (the Ask view).
  onMerge?: (pull: PullRequest) => void
  armed?: readonly string[]
  onToggleArmed?: (pull: PullRequest) => void
}

/**
 * One row per pull request the agent opened: an icon that says where it stands (blinking while its checks run, green once it can be
 * merged), its title and place, how many lines it changes. A ready one offers to ask the agent to merge it; an open one can be set to be
 * merged as soon as it is ready.
 */
export function ChangesList({ pulls, onRefresh, onMerge, armed = [], onToggleArmed }: Props) {
  const { t } = useTranslation('chat')
  return (
    // grid-cols-1 is minmax(0, 1fr): an auto column grows to the longest title and pushes the row out of the card, so truncate never cuts.
    <ul className="m-0 grid min-w-0 list-none grid-cols-1 gap-0.5 p-0">
      {pulls.map((pull) => {
        const status = pullStatus(pull)
        const label = pullStatusLabel(pull)
        const isArmed = armed.includes(pull.url)
        const canArm = onToggleArmed && (status === 'running' || status === 'waiting' || status === 'failing' || status === 'draft')
        return (
          <li key={`${pull.owner}/${pull.repo}#${pull.number}`} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-[var(--surface-hover)]">
            <span className={`inline-flex shrink-0 ${STATUS_COLOR[status]}`} title={label} role="img" aria-label={label}>
              <PullIcon state={pull.state} />
            </span>
            <button
              type="button"
              onClick={() => void window.seshat?.openExternal?.(pull.url)}
              title={`${pull.owner}/${pull.repo} #${pull.number}`}
              className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
            >
              <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{pull.title}</span>
              <span className="block truncate text-[11px] text-[var(--text-muted)]">
                {pullSubtitle(pull)}
                {isArmed && status !== 'merged' && status !== 'closed' && t('chat.panels.changes.changesList.mergesWhenReady')}
              </span>
            </button>
            {(pull.additions > 0 || pull.deletions > 0) && (
              <span className="shrink-0 font-mono text-[10px] tabular-nums">
                <span className="text-[var(--accent-success)]">+{pull.additions}</span> <span className="text-[var(--accent-danger)]">-{pull.deletions}</span>
              </span>
            )}
            {status === 'ready' && onMerge && (
              <button
                type="button"
                onClick={() => onMerge(pull)}
                title={t('chat.panels.changes.changesList.askTheAgentToMerge')}
                className="shrink-0 cursor-pointer rounded-md border border-[var(--accent-success)] bg-transparent px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent-success)] hover:bg-[color-mix(in_srgb,var(--accent-success)_12%,transparent)]"
              >
                {t('chat.panels.changes.changesList.merge')}
              </button>
            )}
            <Dropdown
              label={t('chat.panels.changes.changesList.actionsFor', { number: pull.number })}
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle} aria-label={t('chat.panels.changes.changesList.more')} className="cursor-pointer rounded border-0 bg-transparent px-1 text-[14px] leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  &#8943;
                </button>
              )}
              items={[
                { id: 'open', label: t('chat.panels.changes.changesList.openOnGithub'), onSelect: () => void window.seshat?.openExternal?.(pull.url) },
                { id: 'copy', label: t('chat.panels.changes.changesList.copyLink'), onSelect: () => void navigator.clipboard.writeText(pull.url) },
                ...(canArm
                  ? [{ id: 'arm', label: isArmed ? t('chat.panels.changes.changesList.dontMergeWhenReady') : t('chat.panels.changes.changesList.mergeWhenReady'), onSelect: () => onToggleArmed(pull) }]
                  : []),
                { id: 'refresh', label: t('chat.panels.changes.changesList.refresh'), onSelect: onRefresh }
              ]}
            />
          </li>
        )
      })}
    </ul>
  )
}

function PullIcon({ state }: { state: PullState }) {
  const common = { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (state === 'merged') {
    return (
      <svg {...common}>
        <circle cx="4" cy="3.5" r="1.6" /><circle cx="4" cy="12.5" r="1.6" /><circle cx="12" cy="9" r="1.6" />
        <path d="M4 5.1v5.8M5.5 3.5c3.5 0 6.5 1 6.5 4" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="4" cy="3.5" r="1.6" /><circle cx="4" cy="12.5" r="1.6" /><circle cx="12" cy="12.5" r="1.6" />
      <path d="M4 5.1v5.8" />
      {state === 'closed' ? <path d="M12 3.5v7.4M10.4 5.1l3.2-3.2M13.6 5.1l-3.2-3.2" /> : <path d="M12 10.9V6a2 2 0 0 0-2-2H8m0 0 1.6-1.6M8 4l1.6 1.6" />}
    </svg>
  )
}
