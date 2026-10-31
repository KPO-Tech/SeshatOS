import { Dropdown } from '@renderer/components/ui/Dropdown'
import { CHECKS_LABEL, STATE_LABEL, pullSubtitle, type PullChecks, type PullRequest, type PullState } from '@renderer/lib/pullRequests'

const STATE_COLOR: Record<PullState, string> = {
  open: 'text-[var(--accent-success)]',
  draft: 'text-[var(--text-muted)]',
  merged: 'text-[var(--accent-info)]',
  closed: 'text-[var(--accent-danger)]'
}

const CHECKS_COLOR: Record<PullChecks, string> = {
  passing: 'bg-[var(--accent-success)]',
  failing: 'bg-[var(--accent-danger)]',
  pending: 'bg-[var(--accent-warning)]',
  none: 'bg-transparent',
  unknown: 'bg-transparent'
}

type Props = {
  pulls: PullRequest[]
  onRefresh: () => void
}

/** One row per pull request: its state, title and place, how many lines it changes and where its checks stand. */
export function ChangesList({ pulls, onRefresh }: Props) {
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0">
      {pulls.map((pull) => (
        <li key={`${pull.owner}/${pull.repo}#${pull.number}`} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-[var(--surface-hover)]">
          <span className={STATE_COLOR[pull.state]} title={STATE_LABEL[pull.state]}><PullIcon state={pull.state} /></span>
          <button
            type="button"
            onClick={() => void window.seshat?.openExternal?.(pull.url)}
            title={`${pull.owner}/${pull.repo} #${pull.number}`}
            className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
          >
            <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{pull.title}</span>
            <span className="block truncate text-[11px] text-[var(--text-muted)]">{pullSubtitle(pull)}</span>
          </button>
          {(pull.additions > 0 || pull.deletions > 0) && (
            <span className="shrink-0 font-mono text-[10px] tabular-nums">
              <span className="text-[var(--accent-success)]">+{pull.additions}</span> <span className="text-[var(--accent-danger)]">-{pull.deletions}</span>
            </span>
          )}
          <span
            className={`size-2 shrink-0 rounded-full ${CHECKS_COLOR[pull.checks]} ${pull.checks === 'pending' ? 'animate-pulse' : ''}`}
            title={CHECKS_LABEL[pull.checks]}
            role="img"
            aria-label={CHECKS_LABEL[pull.checks]}
          />
          <Dropdown
            label={`Actions for pull request ${pull.number}`}
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} aria-label="More" className="cursor-pointer rounded border-0 bg-transparent px-1 text-[14px] leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                &#8943;
              </button>
            )}
            items={[
              { id: 'open', label: 'Open on GitHub', onSelect: () => void window.seshat?.openExternal?.(pull.url) },
              { id: 'copy', label: 'Copy link', onSelect: () => void navigator.clipboard.writeText(pull.url) },
              { id: 'refresh', label: 'Refresh', onSelect: onRefresh }
            ]}
          />
        </li>
      ))}
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
