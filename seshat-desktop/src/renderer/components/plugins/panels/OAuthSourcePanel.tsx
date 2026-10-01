import { useState } from 'react'
import { disconnectMyConnectorAccount, fetchMyConnectorAccounts, startCloudOAuth } from '../api/cloudConnectorsApi'
import { disconnectInboxAccount, fetchInboxAccounts, startInboxOAuth, syncInboxAccount } from '../api/inboxApi'
import type { PluginSource } from '../catalog/pluginCatalog'
import type { PluginAccount } from '../pluginsTypes'
import { useOAuthFlow } from '../useOAuthFlow'
import { AccountRows, ErrorNote, PrimaryAction } from './AccountRows'

type Props = {
  source: Extract<PluginSource, { type: 'cloud-oauth' | 'inbox-oauth' }>
  title: string
  accounts: PluginAccount[]
  onChanged: () => void
}

// OAuth accounts of one plugin, either an organization connector (seshat-server)
// or a local inbox channel (seshat-backend). Same flow, different endpoints.
export function OAuthSourcePanel({ source, title, accounts, onChanged }: Props) {
  const oauth = useOAuthFlow()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isInbox = source.type === 'inbox-oauth'

  async function listIds(): Promise<string[]> {
    if (source.type === 'inbox-oauth') return (await fetchInboxAccounts()).filter((a) => a.channel === source.channel).map((a) => a.id)
    return (await fetchMyConnectorAccounts()).filter((a) => a.kind === source.kind).map((a) => a.id)
  }

  async function connect() {
    const known = new Set(accounts.map((account) => account.id))
    await oauth.run({
      start: async () => {
        const started = source.type === 'inbox-oauth' ? await startInboxOAuth(source.channel) : await startCloudOAuth(source.kind, title)
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
      if (isInbox) await disconnectInboxAccount(account.id)
      else await disconnectMyConnectorAccount(account.id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect this account.')
    } finally {
      setBusyId(null)
    }
  }

  async function sync(account: PluginAccount) {
    setBusyId(account.id)
    setError(null)
    try {
      await syncInboxAccount(account.id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.')
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
        extraAction={isInbox && source.channel === 'gmail' ? (account) => (
          <button type="button" disabled={busyId === account.id} onClick={() => void sync(account)} className="h-7 rounded-md border border-[var(--border-soft)] px-2.5 text-[11.5px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-50">
            Sync now
          </button>
        ) : undefined}
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
