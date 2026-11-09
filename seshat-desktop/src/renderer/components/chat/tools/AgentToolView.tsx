import { memo, useCallback, useEffect, useState } from 'react'
import { Robot, CheckOne, CloseOne, LoadingOne } from '@icon-park/react'
import { useSessionStore } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import type { ToolUseBlock, ToolStatus } from '@renderer/api/types'
import { useTranslation } from 'react-i18next'

function useElapsedMs(startedAt: number, active: boolean): number {
  const [ms, setMs] = useState(() => Date.now() - startedAt)
  useEffect(() => {
    if (!active) { setMs(Date.now() - startedAt); return }
    const id = setInterval(() => setMs(Date.now() - startedAt), 1000)
    return () => clearInterval(id)
  }, [startedAt, active])
  return ms
}

function fmtElapsed(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function fmtTokens(n: number): string {
  if (n === 0) return ''
  if (n < 1000) return `${n} tok`
  return `${(n / 1000).toFixed(1)}k tok`
}

type AgentToolCardProps = {
  tool: ToolUseBlock
  sessionId: string
  status: ToolStatus
}

function AgentToolCard({ tool, sessionId, status }: AgentToolCardProps) {
  const { t } = useTranslation('chat')
  const subagent = useSessionStore((s) => s.getSubagent(sessionId, tool.id))
  const openRightPanel = useUIStore((s) => s.openRightPanel)

  const agentType = (tool.input.type as string | undefined)
    ?? subagent?.agentType
    ?? 'agent'
  const task = (tool.input.task as string | undefined)
    ?? (tool.input.prompt as string | undefined)
    ?? subagent?.task
    ?? ''

  // Once a sub-agent entry exists, it is the source of truth for lifecycle status —
  // including 'running'. Falling back to the outer tool-call's own `status` while a
  // sub-agent is still running would be wrong for async tools like spawn_agent: the
  // outer call returns (and its block flips to 'completed') within milliseconds of
  // starting the background agent, well before the agent itself is actually done.
  // The outer `status` is only a reasonable proxy before any sub-agent entry exists
  // at all (the brief window right as the tool call is first dispatched).
  //
  // The `agent` tool's own `run_in_background: true` mode is a DIFFERENT async
  // path than spawn_agent: it never emits a second "subagent_finished" event at
  // all (see the SDK's runAgentBackground - it's designed to be polled via
  // TaskGet/TaskList, not pushed to), so no sub-agent entry is ever created for
  // it here, and the fallback above would show "Completed" forever, the instant
  // the dispatch itself returns - well before the underlying research is done.
  // Its own result payload flags this case explicitly (`background: true`), so
  // it can be told apart from a real synchronous completion.
  const isUntrackedBackgroundDispatch = !subagent
    && status === 'completed'
    && tool._result?.metadata?.background === true

  const derivedStatus: ToolStatus = subagent
    ? subagent.status === 'failed'
      ? 'failed'
      : subagent.status === 'completed'
        ? 'completed'
        : 'running'
    : isUntrackedBackgroundDispatch
      ? 'running'
      : status === 'completed'
        ? 'completed'
        : status === 'failed'
          ? 'failed'
          : 'running'

  const activeTool = subagent?.activeTool
  const turnNumber = subagent?.turnNumber ?? 0
  const tokens = (subagent?.inputTokens ?? 0) + (subagent?.outputTokens ?? 0)
  const startedAt = subagent?.startedAt ?? Date.now()
  const elapsedMs = useElapsedMs(startedAt, derivedStatus === 'running')

  const handleClick = useCallback(() => {
    openRightPanel({
      kind: 'subagent',
      title: agentType,
      sessionId,
      // Pass toolUseId via sessionId slot — we'll use a custom payload
      subagentToolUseId: tool.id,
    } as Parameters<typeof openRightPanel>[0])
  }, [openRightPanel, agentType, sessionId, tool.id])

  const label = agentType.replace(/_/g, ' ').replace(/-/g, ' ')
  const statusText = derivedStatus === 'completed'
    ? t('chat.tools.agentToolView.completed')
    : derivedStatus === 'failed'
      ? t('chat.tools.agentToolView.failed')
      : isUntrackedBackgroundDispatch
        ? t('chat.tools.agentToolView.runningInBackground')
        : t('chat.tools.agentToolView.running')

  // One line like any other tool, in the accent colour: it never unfolds under itself, a click opens
  // the transcript of the agent in its own panel.
  return (
    <div
      className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[12px] leading-snug text-[var(--accent-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)]"
      role="button"
      tabIndex={0}
      title={task || undefined}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
    >
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        {derivedStatus === 'completed'
          ? <CheckOne size={13} />
          : derivedStatus === 'failed'
            ? <CloseOne size={13} />
            : <Robot size={13} />}
      </span>
      <span className="shrink-0 font-medium capitalize">{label}</span>
      {task && <span className="min-w-0 flex-1 truncate text-[11px] text-app-text-muted">{task}</span>}
      {!task && <span className="flex-1" />}
      {derivedStatus === 'failed' && <span className="shrink-0 text-[9px] font-bold leading-none text-app-error">{statusText}</span>}
      {derivedStatus === 'running' && (
        <span className="flex shrink-0 animate-[spin_1s_linear_infinite]" title={statusText}>
          <LoadingOne size={11} />
        </span>
      )}
      {activeTool && derivedStatus === 'running' && <span className="max-w-[30%] shrink-0 truncate text-[10.5px] text-app-text-muted">{activeTool.toolName}</span>}
      {tokens > 0 && <span className="shrink-0 text-[10px] text-app-text-muted">{fmtTokens(tokens)}</span>}
      {(turnNumber > 0 || derivedStatus === 'running') && <span className="shrink-0 text-[10px] tabular-nums text-app-text-muted">{fmtElapsed(elapsedMs)}</span>}
    </div>
  )
}

type Props = {
  tools: ToolUseBlock[]
  sessionId: string
  getStatus: (tool: ToolUseBlock) => ToolStatus
}

export const AgentCardsRow = memo(function AgentCardsRow({ tools, sessionId, getStatus }: Props) {
  return (
    <div className="flex w-full flex-col gap-0.5">
      {tools.map((tool) => (
        <AgentToolCard
          key={tool.id}
          tool={tool}
          sessionId={sessionId}
          status={getStatus(tool)}
        />
      ))}
    </div>
  )
})
