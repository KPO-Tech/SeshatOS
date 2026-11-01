import { useEffect, useMemo, useState } from 'react'
import { ActionButton, Notice, SelectField, SettingRow, SettingsCard, SettingsPage, StatusBadge } from '../../settings/kit'
import { ConfinementCard } from './ConfinementCard'
import { EnvVarRow } from './EnvVarRow'
import type { EnvVarDef } from './environmentTypes'
import { groupEnvVars } from './environmentUtils'
import { fetchSandboxConfig, invalidateSandboxModeCache, saveSandboxMode, type SandboxMode } from './sandboxApi'

const SANDBOX_OPTIONS = [
  { value: 'local', label: 'Direct (this computer)' },
  { value: 'docker', label: 'Isolated (Docker)' }
]

/** Where the agent's commands run, what confines them, and the secrets the backend reads at startup. */
export function EnvironmentConfig() {
  const [catalog, setCatalog] = useState<EnvVarDef[]>([])
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>('local')

  async function load() {
    setLoading(true)
    setNotice(null)
    try {
      const [nextCatalog, nextStatus, sandbox] = await Promise.all([
        window.seshat?.envVars?.catalog() ?? Promise.resolve([]),
        window.seshat?.envVars?.status() ?? Promise.resolve({}),
        fetchSandboxConfig()
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
    try {
      await saveSandboxMode(next)
      invalidateSandboxModeCache()
    } catch (err) {
      setSandboxMode(previous)
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to save the sandbox setting.' })
    }
  }

  const groups = useMemo(() => groupEnvVars(catalog), [catalog])

  async function refreshStatus() {
    setStatus(await (window.seshat?.envVars?.status() ?? Promise.resolve({})))
  }

  async function applyRestart() {
    setRestarting(true)
    setNotice(null)
    try {
      const result = await window.seshat?.envVars?.restartBackend()
      setNotice(result?.ok ? { tone: 'ok', text: 'Backend restarted. The changes are active.' } : { tone: 'error', text: result?.error ?? 'Backend restart is not available.' })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Backend restart failed.' })
    } finally {
      setRestarting(false)
    }
  }

  return (
    <SettingsPage
      id="environment"
      badge={<StatusBadge tone={sandboxMode === 'local' ? 'warn' : 'ok'}>{sandboxMode === 'local' ? 'Direct' : 'Isolated'}</StatusBadge>}
      actions={
        <ActionButton type="button" onClick={() => void applyRestart()} disabled={restarting}>
          {restarting ? 'Restarting...' : 'Restart backend'}
        </ActionButton>
      }
    >
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <SettingsCard title="Commands">
        <SettingRow
          title="Where commands run"
          hint={sandboxMode === 'local' ? 'On this computer, with your files and tools.' : 'In a Docker container, apart from your files and tools.'}
        >
          <div className="w-[210px]">
            <SelectField value={sandboxMode} options={SANDBOX_OPTIONS} onChange={(value) => void changeSandboxMode(value)} />
          </div>
        </SettingRow>
      </SettingsCard>

      <ConfinementCard docker={sandboxMode === 'docker'} />

      {!loading &&
        groups.map((group) => (
          <SettingsCard key={group.id} title={group.label}>
            {group.defs.map((def) => (
              <EnvVarRow key={def.key} def={def} configured={status[def.key] ?? false} onChanged={refreshStatus} />
            ))}
          </SettingsCard>
        ))}
    </SettingsPage>
  )
}
