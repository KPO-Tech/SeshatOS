import { useEffect, useMemo, useState } from 'react'
import { ChartHistogram, CheckOne, Close, Down, Globe, History, Home, LoadingOne, RightC } from '@icon-park/react'
import { derivePlanSnapshot } from '@renderer/lib/plan'
import { useUIStore } from '@renderer/stores/ui'
import { useSessionStore } from '@renderer/stores/session'
import { toolIcon } from '@renderer/components/chat/tools/helpers'
import { renderToolBody, toolLabel, toolSnippet } from '@renderer/components/chat/tools/toolDisplay'
import { toolStatus } from '@renderer/components/chat/tools/quietGroupPhrase'
import type { StreamingBlock } from '@renderer/stores/session'
import type { Message, ToolUseBlock } from '@renderer/api/types'

// Stable empty reference - must be module-level so the Zustand selector returns
// the same reference every render when no session is found. An inline []
// would return a new reference each call, triggering an infinite re-render loop.
const EMPTY_MESSAGES: Message[] = []

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const sectionLabelClass = 'text-[10px] font-bold uppercase tracking-[0.08em] text-app-text-muted'

// Tools that never show up in the Tools page: mode-switch plumbing has no
// useful detail view, bash has its own Terminal panel, and browser_* has its
// own Browser panel (and its own Web page here - see collectVisitedSites).
const WORKSPACE_HIDDEN_TOOLS = new Set([
  'enter_plan_mode',
  'exit_plan_mode',
  'enter_pair_programming_mode',
  'exit_pair_programming_mode',
  'bash',
])

function isWorkspaceVisibleTool(name: string): boolean {
  return !WORKSPACE_HIDDEN_TOOLS.has(name) && !name.startsWith('browser_')
}

type WorkspaceTool = ToolUseBlock & {
  source: 'history' | 'live'
  order: number
}

type VisitedSite = {
  id: string
  url: string
  domain: string
  status: ReturnType<typeof toolStatus>
  source: 'history' | 'live'
  order: number
}

// Everything now lives inside the Screen - Stats is its home, Web and Tools
// are the two pages reachable from there, and picking a tool in Tools opens
// its live detail in the same frame. No separate Activity section anymore.
type ScreenView = 'home' | 'web' | 'tools'

export function ComputerPanel({ sessionId, focusToolId }: { sessionId: string; focusToolId?: string }) {
  const agentState = useSessionStore((s) => s.getAgentState(sessionId))
  const planArtifact = useSessionStore(
    (s) => s.sessions.find((session) => session.id === sessionId)?.planArtifact,
  )
  const sessionMessages = useSessionStore(
    (s) => s.sessions.find((session) => session.id === sessionId)?.messages ?? EMPTY_MESSAGES,
  )
  const streaming = useSessionStore((s) => s.getStreaming(sessionId))
  const subagents = useSessionStore((s) => s.subagentsBySession[sessionId])
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const [view, setView] = useState<ScreenView>('home')
  const [focusedId, setFocusedId] = useState<string | null>(focusToolId ?? null)
  const [planOpen, setPlanOpen] = useState(false)

  // A tool row clicked in the chat transcript (ToolLineItem) opens/updates
  // this same panel with a new focusToolId instead of expanding inline -
  // pick that up even when Computer was already open on something else.
  useEffect(() => {
    if (focusToolId) setFocusedId(focusToolId)
  }, [focusToolId])

  const plan = useMemo(
    () => derivePlanSnapshot(sessionMessages, streaming),
    [sessionMessages, streaming],
  )
  const tools = useMemo(
    () => collectWorkspaceTools(sessionMessages, streaming),
    [sessionMessages, streaming],
  )
  const sites = useMemo(
    () => collectVisitedSites(sessionMessages, streaming),
    [sessionMessages, streaming],
  )

  // A tool that disappears (rare - only if the underlying message somehow
  // drops it) shouldn't leave the Screen stuck on stale content.
  useEffect(() => {
    if (focusedId && !tools.some((tool) => tool.id === focusedId)) setFocusedId(null)
  }, [focusedId, tools])

  const focusedTool = focusedId ? tools.find((tool) => tool.id === focusedId) ?? null : null
  const focusedStatus = focusedTool ? toolStatus(focusedTool) : null
  const focusedIsSubagent = focusedTool ? isSubagentTool(focusedTool.name) : false

  function goHome() {
    setView('home')
    setFocusedId(null)
  }

  function openSubagentPanel(tool: WorkspaceTool) {
    const agentType = subagents?.[tool.id]?.agentType
    openRightPanel({
      kind: 'subagent',
      title: agentType ? agentType.replace(/_/g, ' ').replace(/-/g, ' ') : 'Sub-agent',
      sessionId,
      subagentToolUseId: tool.id,
    })
  }

  function visitSite(site: VisitedSite) {
    openRightPanel({ kind: 'browser', title: 'Browser', sessionId })
    void window.nexus?.browser?.openUrl(site.url, 'builtin', sessionId).catch(() => undefined)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-app-bg">
      {/* Plan: collapsed progress bar by default, click to see the checklist inline */}
      {plan.items.length > 0 && (
        <div className="shrink-0 border-b border-app-border-subtle">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left"
            onClick={() => setPlanOpen((v) => !v)}
          >
            <span className={cx(sectionLabelClass, 'shrink-0')}>Plan</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className="block h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-200"
                style={{ width: `${Math.round((plan.completedCount / plan.items.length) * 100)}%` }}
              />
            </span>
            <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-app-text-muted">
              {plan.completedCount}/{plan.items.length}
            </span>
            <Down size={11} className={cx('shrink-0 text-app-text-muted transition-transform duration-150', planOpen && 'rotate-180')} />
          </button>
          {planOpen && (
            <div className="flex flex-col gap-1.5 px-3 pb-3 pl-[74px]">
              {plan.items.map((item) => (
                <div key={item.id} className="flex items-start gap-1.5">
                  {item.status === 'completed' ? (
                    <span className="mt-px flex size-[13px] shrink-0 items-center justify-center rounded-full bg-app-success text-app-bg">
                      <CheckOne size={8} />
                    </span>
                  ) : (
                    <span
                      className={cx(
                        'mt-1.5 size-[7px] shrink-0 rounded-full',
                        item.status === 'in_progress' ? 'bg-[var(--accent-primary)]' : item.status === 'failed' ? 'bg-app-error' : 'bg-app-text-muted',
                      )}
                    />
                  )}
                  <span className={cx('text-[11.5px] leading-normal', item.status === 'completed' ? 'text-app-text-muted' : 'text-app-text')}>
                    {item.title}
                  </span>
                </div>
              ))}
              {planArtifact && (
                <button
                  type="button"
                  className="mt-1 flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[10.5px] font-semibold text-[var(--accent-primary)] hover:underline"
                  onClick={() => openRightPanel({ kind: 'markdown', title: 'Implementation Plan', sessionId, markdown: planArtifact })}
                >
                  View full plan
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Screen: the whole panel now - styled as a distinct device screen (dark
          bezel, inset frame) so it reads as "the computer" at a glance. Stats
          is home; Web and Tools are its two pages; a focused tool's live
          detail takes over the same frame from Tools. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--surface-root)_92%,black)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-app-border-subtle bg-app-surface px-3 py-2">
          {focusedTool ? (
            <>
              <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-app-surface-elevated text-app-text-secondary">
                {toolIcon(focusedTool.name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-app-text">{toolLabel(focusedTool.name)}</span>
              <span className={cx('shrink-0 text-[9px] font-bold uppercase tracking-[0.04em]', focusedTool.source === 'live' ? 'text-[var(--accent-primary)]' : 'text-app-text-muted')}>
                {focusedTool.source === 'live' ? 'live' : 'past'}
              </span>
            </>
          ) : view === 'web' ? (
            <>
              <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-app-surface-elevated text-app-text-secondary">
                <Globe size={12} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-app-text">Web</span>
            </>
          ) : view === 'tools' ? (
            <>
              <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-app-surface-elevated text-app-text-secondary">
                <History size={12} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-app-text">Tools</span>
            </>
          ) : (
            <>
              <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-app-surface-elevated text-app-text-secondary">
                <ChartHistogram size={12} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-app-text">Stats</span>
            </>
          )}
          <button
            type="button"
            aria-label="Home"
            disabled={view === 'home' && !focusedTool}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            onClick={goHome}
          >
            <Home size={12} />
          </button>
        </div>

        {focusedTool ? (
          <div className="min-h-0 flex-1 overflow-auto p-2.5 [&>*]:max-w-full">
            {focusedIsSubagent ? (
              <div className="flex flex-col items-start gap-2.5 p-1">
                <p className="m-0 text-[11.5px] leading-normal text-app-text-secondary">
                  Sub-agent activity has its own live view, with its own transcript and tool calls.
                </p>
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-semibold text-[var(--accent-primary)] hover:underline"
                  onClick={() => openSubagentPanel(focusedTool)}
                >
                  Open sub-agent view
                  <RightC size={11} />
                </button>
              </div>
            ) : (
              renderToolBody({
                tool: focusedTool,
                result: focusedTool._result,
                status: focusedStatus ?? 'pending',
                sessionId,
                expanded: true,
              })
            )}
          </div>
        ) : view === 'web' ? (
          <div className="min-h-0 flex-1 overflow-auto p-2.5">
            {sites.length === 0 ? (
              <p className="m-0 text-[10.5px] italic text-app-text-muted">No sites visited yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-app-md border border-app-border-subtle bg-white/[0.02] p-2 text-left hover:border-[rgba(239,124,47,0.28)] hover:bg-[rgba(239,124,47,0.055)]"
                    onClick={() => visitSite(site)}
                  >
                    <SiteFavicon domain={site.domain} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[11.5px] font-semibold text-app-text">{site.domain}</span>
                      <span className="truncate text-[10.5px] text-app-text-muted">{site.url}</span>
                    </span>
                    <span className={cx('ml-auto shrink-0 text-[9px] font-bold uppercase tracking-[0.04em]', site.status === 'running' || site.status === 'pending' ? 'text-[var(--accent-primary)]' : 'text-app-text-muted')}>
                      {site.source === 'live' ? 'live' : 'past'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : view === 'tools' ? (
          <div className="min-h-0 flex-1 overflow-auto p-2.5">
            {tools.length === 0 ? (
              <p className="m-0 text-[10.5px] italic text-app-text-muted">No tool activity has been recorded yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {tools.slice().reverse().map((tool) => {
                  const status = toolStatus(tool)
                  const snippet = workspaceToolSnippet(tool)
                  const isSubagent = isSubagentTool(tool.name)
                  const isRunning = status === 'running' || status === 'pending'
                  return (
                    <button
                      key={`${tool.source}-${tool.id}-${tool.order}`}
                      type="button"
                      className={cx(
                        'grid w-full cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-app-md border border-l-[3px] border-app-border-subtle bg-white/[0.02] p-2 text-left text-inherit',
                        'hover:border-r-[rgba(239,124,47,0.28)] hover:border-t-[rgba(239,124,47,0.28)] hover:border-b-[rgba(239,124,47,0.28)] hover:bg-[rgba(239,124,47,0.055)]',
                        isSubagent ? '!border-l-[var(--color-role-router)]' : isRunning ? '!border-l-[var(--accent-primary)]' : '!border-l-transparent',
                      )}
                      onClick={() => setFocusedId(tool.id)}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.05] text-app-text-secondary">
                        {status === 'running' || status === 'pending'
                          ? <LoadingOne size={11} className="animate-spin" />
                          : status === 'failed'
                            ? <Close size={11} className="text-app-error" />
                            : toolIcon(tool.name)}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[var(--font-size-2xs)] font-bold text-app-text">{isSubagent ? subagentLabel(tool, subagents?.[tool.id]) : toolLabel(tool.name)}</span>
                        {snippet && <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-app-text-muted">{snippet}</span>}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-app-text-muted">{tool.source === 'live' ? 'live' : 'past'}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Turn" value={agentState.turnNumber > 0 ? `#${agentState.turnNumber}` : '-'} />
              <Stat label="Input tokens" value={agentState.inputTokens > 0 ? fmt(agentState.inputTokens) : '-'} />
              <Stat label="Output tokens" value={agentState.outputTokens > 0 ? fmt(agentState.outputTokens) : '-'} />
              <Stat label="Total" value={
                agentState.inputTokens + agentState.outputTokens > 0
                  ? fmt(agentState.inputTokens + agentState.outputTokens)
                  : '-'
              } />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="flex cursor-pointer items-center gap-2 rounded-app-md border border-app-border-subtle bg-white/[0.03] px-2.5 py-2 text-left hover:border-[rgba(239,124,47,0.28)] hover:bg-[rgba(239,124,47,0.055)]" onClick={() => setView('web')}>
                <Globe size={13} className="shrink-0 text-app-text-secondary" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-app-text">Web</span>
                <span className="shrink-0 text-[10px] font-semibold text-app-text-muted">{sites.length}</span>
              </button>
              <button type="button" className="flex cursor-pointer items-center gap-2 rounded-app-md border border-app-border-subtle bg-white/[0.03] px-2.5 py-2 text-left hover:border-[rgba(239,124,47,0.28)] hover:bg-[rgba(239,124,47,0.055)]" onClick={() => setView('tools')}>
                <History size={13} className="shrink-0 text-app-text-secondary" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-app-text">Tools</span>
                <span className="shrink-0 text-[10px] font-semibold text-app-text-muted">{tools.length}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function collectWorkspaceTools(messages: Message[], streaming: StreamingBlock[]): WorkspaceTool[] {
  const byId = new Map<string, WorkspaceTool>()
  let order = 0
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== 'tool_use' || !isWorkspaceVisibleTool(block.name)) continue
      byId.set(block.id, { ...block, source: 'history', order: order++ })
    }
  }
  for (const block of streaming ?? []) {
    if (block.type !== 'tool_use' || !isWorkspaceVisibleTool(block.name)) continue
    byId.set(block.id, { ...block, source: 'live', order: order++ })
  }
  return [...byId.values()].sort((a, b) => a.order - b.order)
}

// Sites the agent actually navigated to (browser_open/browser_navigate) -
// separate from the Tools page since these belong to the Browser panel's
// world, not the generic tool list. Most recent first.
function collectVisitedSites(messages: Message[], streaming: StreamingBlock[]): VisitedSite[] {
  const byId = new Map<string, VisitedSite>()
  let order = 0
  const consider = (block: Message['content'][number], source: 'history' | 'live') => {
    if (block.type !== 'tool_use') return
    if (block.name !== 'browser_open' && block.name !== 'browser_navigate') return
    const input = block.input as Record<string, unknown>
    const url = typeof input.url === 'string' ? input.url : typeof input.target === 'string' ? input.target : null
    if (!url) return
    byId.set(block.id, { id: block.id, url, domain: domainLabel(url), status: toolStatus(block), source, order: order++ })
  }
  for (const message of messages) {
    for (const block of message.content) consider(block, 'history')
  }
  for (const block of streaming ?? []) consider(block, 'live')
  return [...byId.values()].sort((a, b) => b.order - a.order)
}

function domainLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function SiteFavicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-app-surface-elevated text-app-text-secondary">
        <Globe size={11} />
      </span>
    )
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-app-surface-elevated" aria-hidden="true">
      <img
        className="block size-full object-cover"
        src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function isSubagentTool(name: string): boolean {
  return name === 'agent' || name === 'spawn_agent'
}

function subagentLabel(tool: ToolUseBlock, subagent?: { agentType: string }): string {
  if (subagent?.agentType) return subagent.agentType.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return toolLabel(tool.name)
}

function workspaceToolSnippet(tool: ToolUseBlock): string {
  const registrySnippet = toolSnippet(tool)
  if (registrySnippet) return registrySnippet
  const values = ['description', 'query', 'url', 'file_path', 'path', 'command', 'task']
  for (const key of values) {
    const value = tool.input[key]
    if (typeof value === 'string' && value.trim()) {
      return value.length > 72 ? `${value.slice(0, 72)}...` : value
    }
  }
  return tool._message ?? ''
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-app-md border border-app-border-subtle bg-white/[0.03] px-2.5 py-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-app-text-muted">{label}</span>
      <span className="font-mono text-[var(--font-size-lg)] font-bold tabular-nums text-app-text">{value}</span>
    </div>
  )
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
