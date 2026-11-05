import { useState } from 'react'
import { CustomSelect, SoftButton, StatusPill } from '@renderer/components/config/knowledge/KnowledgePrimitives'
import { ConnectorIcon } from './ConnectorIcons'
import type { ConnectorAccount, ConnectorDefinition, Corpus } from './connectorTypes'
import { useTranslation } from 'react-i18next'

export function ConnectorCard({
  definition,
  accounts,
  corpora,
  busy,
  onConnect,
  onDisconnect,
  onSync,
  onRunAction
}: {
  definition: ConnectorDefinition
  accounts: ConnectorAccount[]
  corpora: Corpus[]
  busy: boolean
  onConnect: () => void
  onDisconnect: (account: ConnectorAccount) => void
  onSync: (account: ConnectorAccount, corpusId: string) => void
  onRunAction: (account: ConnectorAccount) => void
}) {
  const { t } = useTranslation('knowledge/sources')
  const connected = accounts.length > 0

  return (
    <article className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-soft)] px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <ConnectorIcon kind={definition.kind} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{definition.title}</h3>
              <StatusPill tone={connected ? 'ok' : 'muted'}>{connected ? `${accounts.length} connected` : t('pages.knowledge.sources.connectorCard.notConnected')}</StatusPill>
              <StatusPill tone="muted">{t(definition.category === 'Knowledge' ? 'pages.knowledge.sources.connectorsConfig.knowledge' : 'pages.knowledge.sources.connectorsConfig.actions')}</StatusPill>
            </div>
            <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">{t(definition.description)}</p>
          </div>
        </div>
        <SoftButton tone={connected ? 'default' : 'primary'} onClick={onConnect} disabled={busy}>
          {definition.mode === 'oauth' ? t('pages.knowledge.sources.connectorCard.startOauth') : t('pages.knowledge.sources.connectorCard.connect')}
        </SoftButton>
      </div>

      <div className="grid gap-2 p-3">
        {accounts.length === 0 ? (
          <div className="rounded-md bg-[var(--surface-muted)] px-3 py-3 text-[12px] text-[var(--text-muted)]">{t('pages.knowledge.sources.connectorCard.noAccountConnectedYet')}</div>
        ) : accounts.map((account) => (
          <ConnectorAccountRow
            key={account.id}
            definition={definition}
            account={account}
            corpora={corpora}
            busy={busy}
            onDisconnect={() => onDisconnect(account)}
            onSync={(corpusId) => onSync(account, corpusId)}
            onRunAction={() => onRunAction(account)}
          />
        ))}
      </div>
    </article>
  )
}

function ConnectorAccountRow({
  definition,
  account,
  corpora,
  busy,
  onDisconnect,
  onSync,
  onRunAction
}: {
  definition: ConnectorDefinition
  account: ConnectorAccount
  corpora: Corpus[]
  busy: boolean
  onDisconnect: () => void
  onSync: (corpusId: string) => void
  onRunAction: () => void
}) {
  const { t } = useTranslation('knowledge/sources')
  const [corpusId, setCorpusId] = useState(corpora[0]?.id ?? '')
  const canSync = definition.category === 'Knowledge'
  const corpusOptions = corpora.map((corpus) => ({ value: corpus.id, label: corpus.name, description: `${corpus.file_count ?? 0} files` }))

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{account.display_name || account.external_account_id}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span>{account.status || 'connected'}</span>
          {account.last_error && <span className="text-[var(--accent-danger)]">{account.last_error}</span>}
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {canSync && (
          <div className="w-40">
            <CustomSelect
              compact
              value={corpusId}
              options={corpusOptions.length > 0 ? corpusOptions : [{ value: '', label: t('pages.knowledge.sources.connectorCard.noCorpus') }]}
              onChange={setCorpusId}
            />
          </div>
        )}
        {canSync && <SoftButton onClick={() => onSync(corpusId)} disabled={busy || !corpusId}>{t('pages.knowledge.sources.connectorCard.sync')}</SoftButton>}
        {definition.mode === 'action' && <SoftButton onClick={onRunAction} disabled={busy}>{t('pages.knowledge.sources.connectorCard.testAction')}</SoftButton>}
        <SoftButton tone="danger" onClick={onDisconnect} disabled={busy}>{t('pages.knowledge.sources.connectorCard.disconnect')}</SoftButton>
      </div>
    </div>
  )
}
