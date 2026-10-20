import { useState } from 'react'
import { connectLocalConnector, disconnectLocalConnector, type LocalConnector } from '../api/localConnectorsApi'
import { ErrorNote, PrimaryAction } from './formParts'

type Props = {
  connector: LocalConnector
  onChanged: () => void
}

// Connects a connector with the person's own key, shows its tools and lets them disconnect.
export function LocalConnectorPanel({ connector, onChanged }: Props) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connected = connector.status !== 'disconnected'
  const healthy = connector.status === 'connected'

  async function save() {
    if (!key.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      // A key the vendor refuses comes back as a connector in error; the panel shows the reason from the refreshed list.
      await connectLocalConnector(connector.kind, key.trim())
      setKey('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not connect ${connector.label}.`)
    } finally {
      setSaving(false)
    }
  }

  async function disconnect() {
    if (!window.confirm(`Disconnect ${connector.label}? The key is forgotten and its tools leave your agents.`)) return
    setRemoving(true)
    setError(null)
    try {
      await disconnectLocalConnector(connector.kind)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not disconnect ${connector.label}.`)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {connected && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{connector.label}</div>
            <div className={['mt-0.5 flex items-start gap-1.5 text-[11px] leading-[16px]', healthy ? 'text-[var(--accent-success)]' : 'text-[var(--accent-danger)]'].join(' ')}>
              <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-current" />
              <span className="min-w-0 break-words">
                {healthy ? `Connected, ${connector.tools.length} ${connector.tools.length === 1 ? 'tool' : 'tools'}` : connector.last_error || 'Needs attention'}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={removing}
            onClick={() => void disconnect()}
            className="h-7 shrink-0 rounded-md border border-[var(--border-soft)] px-2.5 text-[11.5px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            {removing ? 'Removing...' : 'Disconnect'}
          </button>
        </div>
      )}

      {healthy && connector.tools.length > 0 && (
        <details className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-[var(--text-secondary)]">Tools your agents can use</summary>
          <ul className="mt-2 grid max-h-40 gap-1 overflow-y-auto">
            {connector.tools.map((tool) => (
              <li key={tool.name} className="truncate text-[11.5px] text-[var(--text-muted)]" title={tool.description}>
                {tool.name}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="grid gap-1.5">
        <label className="text-[11.5px] font-semibold text-[var(--text-muted)]" htmlFor={`key-${connector.kind}`}>
          {connector.credential_label}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`key-${connector.kind}`}
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void save() }}
            placeholder={connected ? 'Paste a new one to replace it' : `Paste your ${connector.credential_label.toLowerCase()}`}
            className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
          <PrimaryAction disabled={saving || !key.trim()} onClick={() => void save()}>{saving ? 'Connecting...' : connected ? 'Replace' : 'Connect'}</PrimaryAction>
        </div>
        <p className="text-[11px] leading-[16px] text-[var(--text-muted)]">
          It stays on this computer, encrypted, and is only sent to {connector.label}.
          {connector.credential_url && (
            <>
              {' '}
              <button type="button" onClick={() => void window.seshat.openExternal(connector.credential_url!)} className="font-semibold text-[var(--accent-primary)] hover:underline">
                Create one
              </button>
            </>
          )}
          {connector.docs_url && (
            <>
              {' '}
              <button type="button" onClick={() => void window.seshat.openExternal(connector.docs_url!)} className="font-semibold text-[var(--accent-primary)] hover:underline">
                How it works
              </button>
            </>
          )}
        </p>
      </div>
      <ErrorNote message={error} />
    </div>
  )
}
