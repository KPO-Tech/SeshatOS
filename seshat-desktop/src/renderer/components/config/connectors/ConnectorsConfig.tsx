import { useEffect, useMemo, useState } from 'react'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import { SoftButton } from '../knowledge/KnowledgePrimitives'
import { ConnectorCard } from './ConnectorCard'
import { connectorCatalog } from './connectorCatalog'
import {
  connectStaticAccount,
  disconnectConnectorAccount,
  fetchConnectorAccounts,
  fetchCorpora,
  fetchDriveAccounts,
  runConnectorAction,
  startConnectorOAuth,
  syncConnectorAccount
} from './connectorsApi'
import { StaticConnectorForm } from './StaticConnectorForm'
import type { ConnectAccountPayload, ConnectorAccount, ConnectorDefinition, ConnectorKind, Corpus } from './connectorTypes'

export function ConnectorsConfig() {
  const [accountsByKind, setAccountsByKind] = useState<Record<string, ConnectorAccount[]>>({})
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [connecting, setConnecting] = useState<ConnectorDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    setMessage(null)
    try {
      const [nextCorpora, driveAccounts, ...genericAccounts] = await Promise.all([
        fetchCorpora(),
        fetchDriveAccounts(),
        ...connectorCatalog.filter((item) => item.kind !== 'gdrive').map((item) => fetchConnectorAccounts(item.kind, item.accountPathKind))
      ])
      setCorpora(nextCorpora)
      const nextAccounts: Record<string, ConnectorAccount[]> = { gdrive: driveAccounts }
      connectorCatalog.filter((item) => item.kind !== 'gdrive').forEach((item, index) => {
        nextAccounts[item.kind] = genericAccounts[index] ?? []
      })
      setAccountsByKind(nextAccounts)
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load connectors.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const metrics = useMemo(() => {
    const accounts = Object.values(accountsByKind).reduce((sum, items) => sum + items.length, 0)
    return [
      { label: 'Connectors', value: String(connectorCatalog.length) },
      { label: 'Accounts', value: String(accounts) },
      { label: 'Corpora', value: String(corpora.length) }
    ]
  }, [accountsByKind, corpora.length])

  async function handleConnect(definition: ConnectorDefinition) {
    if (definition.mode === 'oauth') {
      setBusyId(definition.kind)
      setMessage(null)
      try {
        const started = await startConnectorOAuth(definition.oauthStartPath ?? `/connectors/${definition.kind}/oauth/start`)
        if (started.authorization_url) {
          window.open(started.authorization_url, '_blank')
          setMessage({ tone: 'ok', text: 'OAuth flow opened. Refresh this page after approving access.' })
        }
      } catch (err) {
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to start OAuth.' })
      } finally {
        setBusyId(null)
      }
      return
    }
    setConnecting(definition)
  }

  async function handleStaticConnect(definition: ConnectorDefinition, payload: ConnectAccountPayload) {
    setBusyId(definition.kind)
    setMessage(null)
    try {
      await connectStaticAccount(definition.kind, payload)
      setConnecting(null)
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to connect account.' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDisconnect(definition: ConnectorDefinition, account: ConnectorAccount) {
    setBusyId(account.id)
    setMessage(null)
    try {
      await disconnectConnectorAccount(definition.kind, account.id)
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to disconnect account.' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleSync(definition: ConnectorDefinition, account: ConnectorAccount, corpusId: string) {
    setBusyId(account.id)
    setMessage(null)
    try {
      const result = await syncConnectorAccount(definition.kind, account.id, corpusId)
      setMessage({ tone: 'ok', text: `Sync complete: ${result.ingested ?? 0} item(s) ingested.` })
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Sync failed.' })
    } finally {
      setBusyId(null)
    }
  }

  async function handleAction(definition: ConnectorDefinition, account: ConnectorAccount) {
    setBusyId(account.id)
    setMessage(null)
    try {
      const result = await runConnectorAction(definition.kind, account.id, 'ping', {})
      setMessage({ tone: result.Success ?? result.success ? 'ok' : 'error', text: result.Message ?? result.message ?? 'Action completed.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Action failed.' })
    } finally {
      setBusyId(null)
    }
  }

  const grouped = {
    Knowledge: connectorCatalog.filter((item) => item.category === 'Knowledge'),
    Actions: connectorCatalog.filter((item) => item.category === 'Actions')
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

      <section className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Connector accounts</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Connect external workspaces, then sync knowledge sources into a corpus.</p>
        </div>
        <SoftButton onClick={() => void load()} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</SoftButton>
      </section>

      {connecting && (
        <StaticConnectorForm
          kind={connecting.kind as ConnectorKind}
          saving={busyId === connecting.kind}
          onCancel={() => setConnecting(null)}
          onSubmit={(payload) => handleStaticConnect(connecting, payload)}
        />
      )}

      {loading ? (
        <ProviderEmptyState label="Loading connectors..." />
      ) : (
        <>
          {Object.entries(grouped).map(([group, items]) => (
            <section key={group}>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{group}</h2>
              <div className="mt-3 grid gap-2">
                {items.map((definition) => (
                  <ConnectorCard
                    key={definition.kind}
                    definition={definition}
                    accounts={accountsByKind[definition.kind] ?? []}
                    corpora={corpora}
                    busy={Boolean(busyId)}
                    onConnect={() => void handleConnect(definition)}
                    onDisconnect={(account) => void handleDisconnect(definition, account)}
                    onSync={(account, corpusId) => void handleSync(definition, account, corpusId)}
                    onRunAction={(account) => void handleAction(definition, account)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
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
