import { useGitState } from '@renderer/hooks/useGitState'

/** The git branch of the folder the session works in, under the composer, so it is always in view. Nothing outside a repository. */
export function BranchLabel({ folder }: { folder: string | undefined }) {
  const git = useGitState(folder)
  if (!git?.repo || !git.branch) return null

  const name = git.detached ? `${git.branch} (detached)` : git.branch
  const title = `Git branch ${name}${git.dirty ? ', with changes not committed' : ''}`

  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--text-muted)]" title={title} role="status" aria-label={title}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <circle cx="4" cy="3.5" r="1.6" /><circle cx="4" cy="12.5" r="1.6" /><circle cx="12" cy="6" r="1.6" />
        <path d="M4 5.1v5.8M12 7.6c0 2.4-3 2.4-6.4 4" />
      </svg>
      <span className="truncate">{name}</span>
      {git.dirty && <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent-warning)]" aria-hidden="true" />}
    </span>
  )
}
