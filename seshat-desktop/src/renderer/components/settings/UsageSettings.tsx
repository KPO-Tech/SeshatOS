import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/api/client'
import { EmptyState, Panel } from './SettingsPrimitives'

type UsageEntry = {
  metric: string
  period: string
  period_key: string
  count: number
}

type UsageSummary = {
  entries?: UsageEntry[]
}

export function UsageSettings() {
  const [data, setData] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.get<UsageSummary>('/quotas'))
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Failed to load usage data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => groupUsageEntries(data?.entries ?? []), [data])
  const totals = Object.entries(grouped).map(([metric, entries]) => ({
    metric,
    entries,
    total: entries.reduce((sum, entry) => sum + entry.count, 0)
  }))

  return (
    <Panel title="Usage">
      <div className="max-w-[860px] space-y-5">
        <section className="flex items-center justify-between gap-6">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Personal usage</h2>
            <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
              Local counters for this workspace. They are personal, not organization-wide quotas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </section>

        {loading ? (
          <EmptyState label="Loading usage..." />
        ) : error ? (
          <div className="rounded-lg border border-[var(--accent-danger)] bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">
            {error}
          </div>
        ) : totals.length === 0 ? (
          <EmptyState label="No usage data available yet." />
        ) : (
          <section className="grid grid-cols-2 gap-3">
            {totals.map(({ metric, entries, total }) => (
              <div key={metric} className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
                <div className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">{metric.replace(/_/g, ' ')}</div>
                <div className="mt-2 text-[26px] font-semibold text-[var(--text-primary)]">{total.toLocaleString()}</div>
                <div className="mt-3 grid gap-1.5">
                  {entries.slice(0, 4).map((entry) => (
                    <div key={`${entry.metric}-${entry.period}-${entry.period_key}`} className="flex items-center justify-between border-t border-[var(--border-soft)] pt-1.5 text-[12px]">
                      <span className="text-[var(--text-muted)]">{entry.period} {entry.period_key}</span>
                      <span className="font-semibold text-[var(--text-primary)]">{entry.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </Panel>
  )
}

function groupUsageEntries(entries: UsageEntry[]) {
  return entries.reduce<Record<string, UsageEntry[]>>((grouped, entry) => {
    ;(grouped[entry.metric] ??= []).push(entry)
    return grouped
  }, {})
}
