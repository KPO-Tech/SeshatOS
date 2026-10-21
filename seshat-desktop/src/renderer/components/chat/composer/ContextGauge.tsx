import { formatTokens } from '@renderer/lib/sessionOverview'
import { useContextUsage } from '@renderer/hooks/useContextUsage'

/**
 * A thin gauge under the composer: how full the context is, always in view, so a long conversation does not surprise anyone.
 * Nothing is drawn until the first figure exists.
 */
export function ContextGauge({ sessionId }: { sessionId: string }) {
  const { usage } = useContextUsage(sessionId)
  if (!usage || usage.percent === null || usage.window === null) return null

  const high = usage.percent >= 85
  const title = `Context: ${formatTokens(usage.used)} of ${formatTokens(usage.window)} tokens`
    + (usage.compactAtPercent !== null ? `. Compacted by itself at ${usage.compactAtPercent}%.` : '')

  return (
    <div className="mt-1.5 flex items-center justify-end gap-2 px-2" title={title} role="status" aria-label={title}>
      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{usage.percent}% of context</span>
      <div className="relative h-1 w-24 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${high ? 'bg-[var(--accent-warning)]' : 'bg-[var(--accent-primary)]'}`}
          style={{ width: `${usage.percent}%` }}
        />
        {usage.compactAtPercent !== null && (
          <span className="absolute inset-y-0 w-px bg-[var(--text-muted)] opacity-70" style={{ left: `${usage.compactAtPercent}%` }} />
        )}
      </div>
    </div>
  )
}
