import { useEffect, useMemo, useState } from 'react'
import { ConfigCard, Field, SoftButton, StatusPill, TextInput } from '../knowledge/KnowledgePrimitives'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import {
  connectAutomationDevice,
  disconnectAutomationDevice,
  fetchAutomationJobs,
  fetchAutomationOverview,
  fetchAutomationRuns,
  fetchAutomationStatus,
  registerAutomationDevice,
  triggerAutomationJob
} from './automationApi'
import { AutomationJobCard, AutomationRunRow } from './AutomationJobCard'
import type { AutomationJob, AutomationOverview, AutomationRun, AutomationStatus } from './automationTypes'

export function AutomationConfig() {
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [overview, setOverview] = useState<AutomationOverview | null>(null)
  const [serverUrl, setServerUrl] = useState('')
  const [deviceToken, setDeviceToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    setMessage(null)
    try {
      const nextStatus = await fetchAutomationStatus()
      setStatus(nextStatus)
      if (nextStatus.connected) {
        const [nextRuns, nextJobs, nextOverview] = await Promise.all([
          fetchAutomationRuns().catch(() => []),
          fetchAutomationJobs().catch(() => []),
          fetchAutomationOverview().catch(() => null)
        ])
        setRuns(nextRuns)
        setJobs(nextJobs)
        setOverview(nextOverview)
      } else {
        setRuns([])
        setJobs([])
        setOverview(null)
      }
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load automation.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const metrics = useMemo(() => {
    const stats = overview?.stats
    return [
      { label: 'Connection', value: status?.connected ? 'Connected' : 'Local' },
      { label: 'Jobs', value: String(jobs.length || stats?.total_projects || 0) },
      { label: 'Recent runs', value: String(runs.length || stats?.executions_window || 0) }
    ]
  }, [jobs.length, overview?.stats, runs.length, status?.connected])

  async function registerDevice() {
    setBusy('register')
    setMessage(null)
    try {
      setStatus(await registerAutomationDevice())
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to register this device.' })
    } finally {
      setBusy(null)
    }
  }

  async function connectDevice() {
    setBusy('connect')
    setMessage(null)
    try {
      setStatus(await connectAutomationDevice(serverUrl, deviceToken))
      setDeviceToken('')
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to connect this device.' })
    } finally {
      setBusy(null)
    }
  }

  async function disconnectDevice() {
    setBusy('disconnect')
    setMessage(null)
    try {
      await disconnectAutomationDevice()
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to disconnect.' })
    } finally {
      setBusy(null)
    }
  }

  async function runJob(job: AutomationJob) {
    setBusy(job.id)
    setMessage(null)
    try {
      await triggerAutomationJob(job.id)
      setMessage({ tone: 'ok', text: 'Automation run queued.' })
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to run automation.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      {message && (
        <div className={[
          'rounded-lg border bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold',
          message.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'
        ].join(' ')}>
          {message.text}
        </div>
      )}

      <section className="grid grid-cols-3 gap-2">
        {metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
      </section>

      {loading ? (
        <ProviderEmptyState label="Loading automation..." />
      ) : status?.connected ? (
        <>
          <ConfigCard
            title={status.device_name || 'This device'}
            description={status.server_url || 'Connected to Seshat Server automation.'}
            status={<StatusPill tone="ok">Connected</StatusPill>}
            action={<SoftButton tone="danger" disabled={busy === 'disconnect'} onClick={() => void disconnectDevice()}>{busy === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}</SoftButton>}
          >
            <div className="grid grid-cols-3 gap-2">
              <Info label="Device ID" value={status.device_id || 'Unknown'} />
              <Info label="Connected since" value={formatDate(status.connected_at)} />
              <Info label="Policy bundle" value={String(Object.keys(status.policies ?? {}).length)} />
            </div>
          </ConfigCard>

          <section>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Scheduled jobs</h2>
              <SoftButton onClick={() => void load()}>Refresh</SoftButton>
            </div>
            <div className="mt-3 grid gap-2">
              {jobs.length === 0 ? <ProviderEmptyState label="No scheduled jobs available for this account." /> : jobs.map((job) => (
                <AutomationJobCard key={job.id} job={job} busy={busy === job.id} onRun={(item) => void runJob(item)} />
              ))}
            </div>
          </section>

          <ConfigCard title="Recent runs" description="Read-only execution history assigned to this desktop." status={<StatusPill tone="muted">Device view</StatusPill>}>
            <div className="grid gap-2">
              {runs.length === 0 ? <ProviderEmptyState label="No recent automation runs on this device." /> : runs.slice(0, 8).map((run) => <AutomationRunRow key={run.id} run={run} />)}
            </div>
          </ConfigCard>
        </>
      ) : (
        <ConfigCard
          title="Connect automation"
          description="Pair this desktop with Seshat Server so scheduled jobs can be assigned and executed here."
          status={<StatusPill tone="muted">Not connected</StatusPill>}
          action={<SoftButton onClick={() => void registerDevice()} disabled={busy === 'register'}>{busy === 'register' ? 'Registering...' : 'Register device'}</SoftButton>}
        >
          <div className="grid gap-4">
            <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
              Use one-click registration when this desktop is already connected to an organization server. Otherwise paste a manual device token below.
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <Field label="Server URL">
                <TextInput value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="https://server.example.com" />
              </Field>
              <Field label="Device token">
                <TextInput type="password" value={deviceToken} onChange={(event) => setDeviceToken(event.target.value)} placeholder="Paste token" />
              </Field>
              <SoftButton tone="primary" disabled={busy === 'connect' || !serverUrl.trim() || !deviceToken.trim()} onClick={() => void connectDevice()}>
                {busy === 'connect' ? 'Connecting...' : 'Connect'}
              </SoftButton>
            </div>
          </div>
        </ConfigCard>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2.5">
      <div className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-[20px] font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
      <div className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}

function formatDate(value?: string) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
