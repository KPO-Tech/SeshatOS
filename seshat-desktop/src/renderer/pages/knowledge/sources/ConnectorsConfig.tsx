import { useEffect, useState } from 'react'
import { PluginCard } from '@renderer/components/plugins/PluginCard'
import { ConnectorIcon } from './ConnectorIcons'
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
import { useNavigate } from 'react-router'
import { AddSourceDialog } from '../collections/AddSourceDialog'
import { useDeviceMode } from '../useCanManage'
import type { ConnectAccountPayload, ConnectorAccount, ConnectorDefinition, ConnectorKind, Corpus } from './connectorTypes'

export function ConnectorsConfig() {
  const [accountsByKind, setAccountsByKind] = useState<Record<string, ConnectorAccount[]>>({})
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [connecting, setConnecting] = useState<ConnectorDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'Knowledge' | 'Actions'>('all')
  const [openKind, setOpenKind] = useState<string | null>(null)
  const [folderOpen, setFolderOpen] = useState(false)
  const navigate = useNavigate()
  const mode = useDeviceMode()
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

  const needle = query.trim().toLowerCase()
  const matching = connectorCatalog.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(needle))
  // A folder of this computer is analysed on this computer only: a device paired with an organization keeps its collections on the server.
  const showFolder = mode === 'standalone' && (filter === 'all' || filter === 'Knowledge') && LOCAL_FOLDER_TEXT.includes(needle)
  const groups = (['Knowledge', 'Actions'] as const)
    .filter((group) => filter === 'all' || filter === group)
    .map((group) => ({ group, items: matching.filter((item) => item.category === group) }))
    .filter((entry) => entry.items.length > 0 || (entry.group === 'Knowledge' && showFolder))
  const opened = connectorCatalog.find((item) => item.kind === openKind) ?? null

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">Sources</h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex h-7 items-center rounded-lg border border-[var(--border-soft)] px-3 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <p className="mt-1 shrink-0 text-[12px] text-[var(--text-muted)]">Connect the places your documents live, and synchronize them into a collection.</p>

      <div className="relative mt-3 shrink-0">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sources"
          className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-9 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      <div className="no-scrollbar mt-3 flex shrink-0 gap-1.5 overflow-x-auto">
        {(['all', 'Knowledge', 'Actions'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={['h-7 shrink-0 rounded-full px-3 text-[12px] font-semibold transition-colors', filter === item ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'].join(' ')}
          >
            {item === 'all' ? 'All' : item}
          </button>
        ))}
      </div>

      {message && (
        <div className={[
          'mt-3 shrink-0 rounded-lg border bg-[var(--surface-panel)] px-4 py-2.5 text-[12.5px] font-semibold',
          message.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'
        ].join(' ')}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] font-semibold text-[var(--text-muted)]">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center pb-16 text-[13px] font-semibold text-[var(--text-muted)]">No sources match your search.</div>
      ) : (
        <div className="no-scrollbar mt-5 min-h-0 flex-1 space-y-7 overflow-y-auto pb-8">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">{group}</h2>
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-2.5">
                {group === 'Knowledge' && showFolder && (
                  <PluginCard
                    title="Local folder"
                    description="Add a folder of this computer as a source. Nothing is read until you analyse it."
                    icon={<FolderIcon />}
                    connected={false}
                    onOpen={() => setFolderOpen(true)}
                  />
                )}
                {items.map((definition) => {
                  const accounts = accountsByKind[definition.kind] ?? []
                  const needsAttention = accounts.some((account) => Boolean(account.last_error))
                  return (
                    <PluginCard
                      key={definition.kind}
                      title={definition.title}
                      description={definition.description}
                      icon={<ConnectorIcon kind={definition.kind} size={34} />}
                      connected={accounts.length > 0}
                      needsAttention={needsAttention}
                      onOpen={() => setOpenKind(definition.kind)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {folderOpen && (
        <AddSourceDialog
          onClose={() => setFolderOpen(false)}
          onAdded={() => {
            setFolderOpen(false)
            navigate('/knowledge/collections')
          }}
        />
      )}

      {opened && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-8 py-8 backdrop-blur-sm" onMouseDown={() => setOpenKind(null)}>
          <div
            className="relative flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_26px_90px_rgba(0,0,0,0.45)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => setOpenKind(null)} aria-label="Close" className="absolute right-4 top-4 z-10 flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
            <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pt-12">
              {connecting?.kind === opened.kind && (
                <StaticConnectorForm
                  kind={connecting.kind as ConnectorKind}
                  saving={busyId === connecting.kind}
                  onCancel={() => setConnecting(null)}
                  onSubmit={(payload) => handleStaticConnect(connecting, payload)}
                />
              )}
              <ConnectorCard
                definition={opened}
                accounts={accountsByKind[opened.kind] ?? []}
                corpora={corpora}
                busy={Boolean(busyId)}
                onConnect={() => void handleConnect(opened)}
                onDisconnect={(account) => void handleDisconnect(opened, account)}
                onSync={(account, corpusId) => void handleSync(opened, account, corpusId)}
                onRunAction={(account) => void handleAction(opened, account)}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

const LOCAL_FOLDER_TEXT = 'local folder add a folder of this computer as a source. nothing is read until you analyse it.'

function FolderIcon() {
  return (
    <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-primary)]/12 text-[var(--accent-primary)]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2a1.5 1.5 0 0 1 1.1.5l1.2 1.4a1.5 1.5 0 0 0 1.1.5h7.4A1.5 1.5 0 0 1 21 9.9v8.6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
      </svg>
    </span>
  )
}
