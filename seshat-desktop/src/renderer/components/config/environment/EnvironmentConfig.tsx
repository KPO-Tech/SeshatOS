import { useEffect, useMemo, useState } from 'react'
import { ActionButton, Notice, SelectField, SettingRow, SettingsCard, SettingsPage, StatusBadge } from '../../settings/kit'
import { ConfinementCard } from './ConfinementCard'
import { EnvVarRow } from './EnvVarRow'
import type { EnvVarDef } from './environmentTypes'
import { groupEnvVars } from './environmentUtils'
import { ProtectedFolders } from './ProtectedFolders'
import { fetchSandboxConfig, invalidateSandboxModeCache, saveProtectedPaths, saveSandboxMode, type SandboxMode } from './sandboxApi'

const SANDBOX_OPTIONS = [
  { value: 'local', label: 'Direct (this computer)' },
  { value: 'project', label: 'Sandbox (this computer)' },
  { value: 'docker', label: 'Isolated (Docker)' }
]

const SANDBOX_HINTS: Record<SandboxMode, string> = {
  local: 'On this computer, with your files and tools.',
  project: "On this computer, confined to the session's folder.",
  docker: 'In a Docker container, apart from your files and tools.'
}

/** Where the agent's commands run, what confines them, and the secrets the backend reads at startup. */
export function EnvironmentConfig() {
  const [catalog, setCatalog] = useState<EnvVarDef[]>([])
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>('local')
  const [projectAvailable, setProjectAvailable] = useState(false)
  const [projectReason, setProjectReason] = useState('')
  const [protectedPaths, setProtectedPaths] = useState<string[]>([])
  const [applying, setApplying] = useState(false)

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
      if (sandbox) {
        setSandboxMode(sandbox.mode)
        setProjectAvailable(sandbox.project_available === true)
        setProjectReason(sandbox.project_unavailable_reason ?? '')
        setProtectedPaths(sandbox.deny_read ?? [])
      }
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
    const next: SandboxMode = mode === 'docker' || mode === 'project' ? mode : 'local'
    const previous = sandboxMode
    setSandboxMode(next)
    setApplying(true)
    setNotice(null)
    try {
      await saveSandboxMode(next)
      invalidateSandboxModeCache()
    } catch (err) {
      setSandboxMode(previous)
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to save the sandbox setting.' })
    } finally {
      setApplying(false)
    }
  }

  async function changeProtectedPaths(next: string[]) {
    setApplying(true)
    setNotice(null)
    try {
      const saved = await saveProtectedPaths(next)
      setProtectedPaths(saved.deny_read ?? next)
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to change what is protected.' })
    } finally {
      setApplying(false)
    }
  }

  const sandboxOptions = SANDBOX_OPTIONS.filter((option) => option.value !== 'project' || projectAvailable || sandboxMode === 'project')

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
      badge={<StatusBadge tone={sandboxMode === 'local' ? 'warn' : 'ok'}>{sandboxMode === 'local' ? 'Direct' : sandboxMode === 'project' ? 'Sandbox' : 'Isolated'}</StatusBadge>}
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
          hint={applying ? 'Applying, this can take a moment on large folders...' : (sandboxMode === 'project' && !projectAvailable && projectReason) || SANDBOX_HINTS[sandboxMode]}
        >
          <div className="w-[210px]">
            <SelectField value={sandboxMode} options={sandboxOptions} onChange={(value) => void changeSandboxMode(value)} />
          </div>
        </SettingRow>
      </SettingsCard>

      <ConfinementCard mode={sandboxMode} />

      {sandboxMode === 'project' && <ProtectedFolders paths={protectedPaths} busy={applying} onChange={(next) => void changeProtectedPaths(next)} />}

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
