import { useState } from 'react'
import { connectStaticAccount, disconnectMyConnectorAccount } from '../api/cloudConnectorsApi'
import type { PluginAccount } from '../pluginsTypes'
import { AccountRows, ErrorNote, PrimaryAction } from './AccountRows'

type Props = {
  kind: string
  title: string
  accounts: PluginAccount[]
  onChanged: () => void
}

// Connectors that authenticate with one pasted secret instead of OAuth.
export function ApiKeySourcePanel({ kind, title, accounts, onChanged }: Props) {
  const [secret, setSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!secret.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      await connectStaticAccount(kind, secret.trim(), title)
      setSecret('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not connect ${title}.`)
    } finally {
      setSaving(false)
    }
  }

  async function disconnect(account: PluginAccount) {
    if (!window.confirm(`Disconnect ${account.label}?`)) return
    setBusyId(account.id)
    setError(null)
    try {
      await disconnectMyConnectorAccount(account.id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect this account.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="grid gap-3">
      <AccountRows accounts={accounts} busyId={busyId} onDisconnect={(account) => void disconnect(account)} />
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder={accounts.length > 0 ? 'Paste a new API key to replace it' : 'Paste your API key'}
          className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
        <PrimaryAction disabled={saving || !secret.trim()} onClick={() => void save()}>{saving ? 'Saving...' : 'Save'}</PrimaryAction>
      </div>
      <ErrorNote message={error} />
    </div>
  )
}
