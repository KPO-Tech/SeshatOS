import { useState } from 'react'
import { disconnectMyConnectorAccount, fetchMyConnectorAccounts, startCloudOAuth } from '../api/cloudConnectorsApi'
import type { PluginSource } from '../catalog/pluginCatalog'
import type { PluginAccount } from '../pluginsTypes'
import { useOAuthFlow } from '../useOAuthFlow'
import { AccountRows, ErrorNote, PrimaryAction } from './AccountRows'

type Props = {
  source: Extract<PluginSource, { type: 'cloud-oauth' }>
  title: string
  accounts: PluginAccount[]
  onChanged: () => void
}

// OAuth accounts of one plugin: an organization connector (seshat-server).
export function OAuthSourcePanel({ source, title, accounts, onChanged }: Props) {
  const oauth = useOAuthFlow()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function listIds(): Promise<string[]> {
    return (await fetchMyConnectorAccounts()).filter((a) => a.kind === source.kind).map((a) => a.id)
  }

  async function connect() {
    const known = new Set(accounts.map((account) => account.id))
    await oauth.run({
      start: async () => {
        const started = await startCloudOAuth(source.kind, title)
        return started.authorization_url
      },
      isDone: async () => (await listIds()).some((id) => !known.has(id)),
      onDone: onChanged
    })
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
      <AccountRows
        accounts={accounts}
        busyId={busyId}
        onDisconnect={(account) => void disconnect(account)}
      />
      <ErrorNote message={error ?? oauth.error} />
      <div className="flex items-center gap-3">
        <PrimaryAction disabled={oauth.connecting} onClick={() => void connect()}>
          {oauth.connecting ? 'Waiting for your browser...' : accounts.length > 0 ? 'Add another account' : `Connect ${title}`}
        </PrimaryAction>
        {oauth.connecting && (
          <button type="button" onClick={oauth.cancel} className="text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]">Cancel</button>
        )}
      </div>
    </div>
  )
}
