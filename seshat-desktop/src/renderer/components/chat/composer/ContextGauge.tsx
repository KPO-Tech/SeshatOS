import { formatTokens } from '@renderer/lib/sessionOverview'
import { useContextUsage } from '@renderer/hooks/useContextUsage'
import { useTranslation } from 'react-i18next'

/**
 * A thin gauge in the line under the composer: how full the context is, always in view, so a long conversation does not
 * surprise anyone. Nothing is drawn until the first figure exists.
 */
export function ContextGauge({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation('chat')
  const { usage } = useContextUsage(sessionId)
  if (!usage || usage.percent === null || usage.window === null) return null

  const high = usage.percent >= 85
  const title = t('chat.composer.contextGauge.title', { used: formatTokens(usage.used), window: formatTokens(usage.window) })
    + (usage.compactAtPercent !== null ? t('chat.composer.contextGauge.compactedAt', { percent: usage.compactAtPercent }) : '')

  return (
    <div className="ml-auto flex items-center gap-2" title={title} role="status" aria-label={title}>
      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{t('chat.composer.contextGauge.percentOfContext', { percent: usage.percent })}</span>
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
