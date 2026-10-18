import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Down } from '@icon-park/react'
import { fetchProviderModels } from '@renderer/hooks/useProviders'
import { currentSandboxMode } from '@renderer/components/config/environment/sandboxApi'
import { confinementView } from '@renderer/components/config/environment/confinementView'
import { fetchMCPServers } from '@renderer/components/config/mcp/mcpApi'
import type { MCPServer } from '@renderer/components/config/mcp/mcpTypes'
import { FileIcon } from '@renderer/components/ui/FileIcon'
import { collectChangedFiles } from '@renderer/lib/changedFiles'
import { connectorRows, contextUsage, environmentRows, formatTokens } from '@renderer/lib/sessionOverview'
import { useSessionStore } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const EMPTY: never[] = []

type Props = {
  sessionId: string
  webCount: number
  toolCount: number
  onOpenWeb: () => void
  onOpenTools: () => void
}

/**
 * The home of the session panel: a few cards, each answering one question (where do commands run, how full is the
 * context, what is connected, which files came out, how much happened). A card with nothing to show is not drawn.
 */
export function SessionOverview({ sessionId, webCount, toolCount, onOpenWeb, onOpenTools }: Props) {
  const agentState = useSessionStore((s) => s.getAgentState(sessionId))
  const session = useSessionStore((s) => s.sessions.find((item) => item.id === sessionId))
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const messages = session?.messages ?? EMPTY

  const [docker, setDocker] = useState(false)
  const [confinement, setConfinement] = useState<{ label: string; confined: boolean } | null>(null)
  const [windowTokens, setWindowTokens] = useState<number | null>(null)
  const [servers, setServers] = useState<MCPServer[]>([])

  useEffect(() => {
    let cancelled = false
    void currentSandboxMode()
      .then(async (mode) => {
        const isDocker = mode === 'docker'
        const status = isDocker ? null : await (window.nexus?.sandbox?.srtStatus() ?? Promise.resolve(null)).catch(() => null)
        if (cancelled) return
        setDocker(isDocker)
        const view = isDocker || status ? confinementView(status, isDocker) : null
        setConfinement(view ? { label: view.label, confined: view.confined } : null)
      })
      .catch(() => undefined)
    void fetchMCPServers().then((list) => { if (!cancelled) setServers(list) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const providerId = session?.providerSettingId
  const modelId = session?.modelId
  useEffect(() => {
    if (!providerId || !modelId) return
    let cancelled = false
    void fetchProviderModels(providerId)
      .then((models) => {
        if (cancelled) return
        const model = models.find((item) => item.model_id === modelId)
        setWindowTokens(model?.context_window && model.context_window > 0 ? model.context_window : null)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [providerId, modelId])

  const environment = environmentRows({ docker, workspacePath: session?.workspacePath, confinement })
  const context = contextUsage(agentState.inputTokens, agentState.outputTokens, windowTokens, agentState.liveContext)
  const connectors = connectorRows(servers)
  const outputs = useMemo(() => collectChangedFiles(messages), [messages])
  const hasActivity = agentState.turnNumber > 0 || toolCount > 0 || webCount > 0

  const cards: ReactNode[] = []

  if (environment.length > 0) {
    cards.push(
      <OverviewCard key="environment" title="Environment">
        <dl className="m-0 grid gap-1.5">
          {environment.map((row) => (
            <div key={row.label} className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-2">
              <dt className="text-[11px] text-[var(--text-muted)]">{row.label}</dt>
              <dd className={cx('m-0 truncate text-[12px]', row.tone === 'warn' ? 'font-semibold text-[var(--accent-warning)]' : 'text-[var(--text-primary)]')} title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </OverviewCard>
    )
  }

  if (context) {
    const high = (context.percent ?? 0) >= 85
    cards.push(
      <OverviewCard key="context" title="Context">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{context.percent !== null ? `${context.percent}% used` : `${formatTokens(context.used)} tokens`}</span>
          {context.window !== null && (
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{formatTokens(context.used)} / {formatTokens(context.window)}</span>
          )}
        </div>
        {context.percent !== null && (
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <div
              className={cx('h-full rounded-full transition-[width] duration-300', high ? 'bg-[var(--accent-warning)]' : 'bg-[var(--accent-primary)]')}
              style={{ width: `${context.percent}%` }}
            />
            {context.compactAtPercent !== null && (
              <span
                className="absolute inset-y-0 w-px bg-[var(--text-muted)] opacity-70"
                style={{ left: `${context.compactAtPercent}%` }}
                title={`The conversation is compacted by itself at ${context.compactAtPercent}%`}
              />
            )}
          </div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-x-3 text-[11px] text-[var(--text-muted)]">
          <span>Sent <b className="font-semibold tabular-nums text-[var(--text-secondary)]">{formatTokens(agentState.inputTokens)}</b></span>
          <span>Replied <b className="font-semibold tabular-nums text-[var(--text-secondary)]">{formatTokens(agentState.outputTokens)}</b></span>
        </div>
      </OverviewCard>
    )
  }

  if (connectors.total > 0) {
    cards.push(
      <OverviewCard key="connectors" title="Connectors" count={connectors.total}>
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {connectors.shown.map((row) => (
            <li key={row.id} className="flex items-center gap-2 text-[12px] text-[var(--text-primary)]">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--surface-muted)] text-[10px] font-bold uppercase text-[var(--text-secondary)]">{row.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              {row.kind && <span className="shrink-0 text-[10px] uppercase text-[var(--text-muted)]">{row.kind}</span>}
            </li>
          ))}
        </ul>
        {connectors.hidden > 0 && <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">and {connectors.hidden} more</div>}
      </OverviewCard>
    )
  }

  if (outputs.length > 0) {
    cards.push(
      <OverviewCard key="outputs" title="Outputs" count={outputs.length}>
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {outputs.map((file) => (
            <li key={file.path}>
              <button
                type="button"
                title={file.path}
                onClick={() => openRightPanel({ kind: 'files', title: 'Files', sessionId, focusToolId: file.toolId })}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1 py-1 text-left hover:bg-[var(--surface-hover)]"
              >
                <FileIcon path={file.path} size={16} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">{file.name}</span>
                <span className="shrink-0 text-[10px] font-semibold uppercase text-[var(--text-muted)]">{file.status === 'created' ? 'new' : 'edited'}</span>
              </button>
            </li>
          ))}
        </ul>
      </OverviewCard>
    )
  }

  if (hasActivity) {
    cards.push(
      <OverviewCard key="activity" title="Activity">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Figure label="Turns" value={agentState.turnNumber > 0 ? String(agentState.turnNumber) : '-'} />
          <Figure label="Tools" value={String(toolCount)} />
          <Figure label="Sites" value={String(webCount)} />
        </div>
        {(toolCount > 0 || webCount > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {toolCount > 0 && <PageLink onClick={onOpenTools}>All tools</PageLink>}
            {webCount > 0 && <PageLink onClick={onOpenWeb}>Sites visited</PageLink>}
          </div>
        )}
      </OverviewCard>
    )
  }

  if (cards.length === 0) {
    return <p className="m-0 p-1 text-[12px] italic text-[var(--text-muted)]">Nothing to show yet. This fills in as the conversation goes on.</p>
  }
  return <div className="flex flex-col gap-3">{cards}</div>
}

function OverviewCard({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border-0 bg-transparent px-3.5 py-2.5 text-left"
      >
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="flex items-center gap-2 text-[var(--text-muted)]">
          {count !== undefined && <span className="text-[11px] tabular-nums">{count}</span>}
          <Down size={11} className={cx('transition-transform duration-150', !open && '-rotate-90')} />
        </span>
      </button>
      {open && <div className="px-3.5 pb-3">{children}</div>}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-muted)] px-2 py-1.5">
      <div className="font-mono text-[15px] font-bold tabular-nums text-[var(--text-primary)]">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
    </div>
  )
}

function PageLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer rounded-md border border-[var(--border-soft)] bg-transparent px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
      {children}
    </button>
  )
}
