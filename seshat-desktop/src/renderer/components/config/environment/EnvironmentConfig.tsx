import { useEffect, useMemo, useState } from 'react'
import { ConfigCard, CustomSelect, SoftButton, StatusPill } from '../knowledge/KnowledgePrimitives'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import { EnvVarRow } from './EnvVarRow'
import type { EnvVarDef } from './environmentTypes'
import { groupEnvVars } from './environmentUtils'
import { fetchSandboxConfig, invalidateSandboxModeCache, saveSandboxMode, type SandboxMode } from './sandboxApi'

const SANDBOX_OPTIONS = [
  { value: 'local', label: 'Direct (this machine)', description: 'No sandbox' },
  { value: 'docker', label: 'Isolated (Docker)', description: 'Sandboxed' },
]

export function EnvironmentConfig() {
  const [catalog, setCatalog] = useState<EnvVarDef[]>([])
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>('local')
  const [sandboxSaving, setSandboxSaving] = useState(false)

  async function load() {
    setLoading(true)
    setNotice(null)
    try {
      const [nextCatalog, nextStatus, sandbox] = await Promise.all([
        window.nexus?.envVars?.catalog() ?? Promise.resolve([]),
        window.nexus?.envVars?.status() ?? Promise.resolve({}),
        fetchSandboxConfig(),
      ])
      setCatalog(nextCatalog)
      setStatus(nextStatus)
      if (sandbox) setSandboxMode(sandbox.mode)
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load environment variables.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function changeSandboxMode(mode: string) {
    const next = mode === 'docker' ? 'docker' : 'local'
    const previous = sandboxMode
    setSandboxMode(next)
    setSandboxSaving(true)
    try {
      await saveSandboxMode(next)
      invalidateSandboxModeCache()
    } catch (err) {
      setSandboxMode(previous)
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to save the sandbox setting.' })
    } finally {
      setSandboxSaving(false)
    }
  }

  const visibleCatalog = useMemo(() => catalog.filter((def) => !def.hidden), [catalog])
  const groups = useMemo(() => groupEnvVars(catalog), [catalog])
  const configuredCount = visibleCatalog.filter((def) => status[def.key]).length

  async function refreshStatus() {
    setStatus(await (window.nexus?.envVars?.status() ?? Promise.resolve({})))
  }

  async function applyRestart() {
    setRestarting(true)
    setNotice(null)
    try {
      const result = await window.nexus?.envVars?.restartBackend()
      setNotice(result?.ok
        ? { tone: 'ok', text: 'Backend restarted. Environment changes are active.' }
        : { tone: 'error', text: result?.error ?? 'Backend restart is not available.' })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Backend restart failed.' })
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className={[
          'rounded-lg border bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold',
          notice.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'
        ].join(' ')}>
          {notice.text}
        </div>
      )}

      <section className="grid grid-cols-3 gap-2">
        <Metric label="Variables" value={String(visibleCatalog.length)} />
        <Metric label="Configured" value={String(configuredCount)} />
        <Metric label="Storage" value="Encrypted" />
      </section>

      <ConfigCard
        title="Secure environment"
        description="Credentials are stored through Electron safe storage. The backend reads environment values at startup."
        status={<StatusPill tone="ok">Local</StatusPill>}
        action={<SoftButton tone="primary" onClick={() => void applyRestart()} disabled={restarting}>{restarting ? 'Applying...' : 'Apply restart'}</SoftButton>}
      >
        <div className="text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
          In development, restart the backend terminal manually after changes. In packaged desktop builds, this will become the sidecar restart flow.
        </div>
      </ConfigCard>

      <ConfigCard
        title="Bash execution"
        description="Where the agent's bash tool runs commands - affects every new conversation turn."
        status={<StatusPill tone={sandboxMode === 'local' ? 'warn' : 'ok'}>{sandboxMode === 'local' ? 'Direct' : 'Isolated'}</StatusPill>}
      >
        <div className="grid gap-3">
          <CustomSelect
            value={sandboxMode}
            options={SANDBOX_OPTIONS}
            onChange={(value) => void changeSandboxMode(value)}
            compact
          />
          <div className="text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
            {sandboxMode === 'local'
              ? 'Commands run directly on this machine, unconfined - the agent can read/write real files and use whatever is actually installed. Recommended if you want it to help with your own documents, code, or local tools.'
              : 'Commands run inside a disposable Docker container, isolated from the rest of this machine - safer, but the agent cannot see your real files or locally installed tools.'}
          </div>
          {sandboxSaving && <div className="text-[11px] font-semibold text-[var(--text-muted)]">Saving...</div>}
        </div>
      </ConfigCard>

      {loading ? (
        <ProviderEmptyState label="Loading environment catalog..." />
      ) : groups.length === 0 ? (
        <ProviderEmptyState label="No environment variables are available for this desktop build." />
      ) : groups.map((group) => (
        <section key={group.id}>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{group.label}</h2>
          <div className="mt-3 grid gap-2">
            {group.defs.map((def) => (
              <EnvVarRow key={def.key} def={def} configured={status[def.key] ?? false} onChanged={refreshStatus} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2.5">
      <div className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-[20px] font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}
