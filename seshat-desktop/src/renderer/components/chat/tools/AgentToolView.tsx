import { memo, useCallback, useEffect, useState } from 'react'
import { Robot, CheckOne, CloseOne, LoadingOne } from '@icon-park/react'
import { useSessionStore } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import type { ToolUseBlock, ToolStatus } from '@renderer/api/types'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const STATUS_BORDER_CSS: Record<ToolStatus, string> = {
  running: 'border-[rgba(239,124,47,0.28)]',
  completed: 'border-[rgba(var(--color-success-rgb),0.2)]',
  failed: 'border-[rgba(var(--color-error-rgb),0.24)]',
  pending: 'border-app-border-subtle',
  awaiting_approval: 'border-app-border-subtle',
}

const STATUS_ICON_CSS: Record<ToolStatus, string> = {
  running: 'bg-[rgba(239,124,47,0.12)] text-[var(--accent-primary)]',
  completed: 'bg-[rgba(var(--color-success-rgb),0.12)] text-app-success',
  failed: 'bg-[rgba(var(--color-error-rgb),0.12)] text-app-error',
  pending: 'bg-[rgba(239,124,47,0.12)] text-[var(--accent-primary)]',
  awaiting_approval: 'bg-[rgba(239,124,47,0.12)] text-[var(--accent-primary)]',
}

const STATUS_TEXT_CSS: Record<ToolStatus, string> = {
  running: 'text-[var(--accent-primary)]',
  completed: 'text-app-success',
  failed: 'text-app-error',
  pending: 'text-app-text-muted',
  awaiting_approval: 'text-app-text-muted',
}

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

  return (
    <div
      className={cx(
        'flex min-w-[220px] max-w-full flex-1 basis-0 cursor-pointer flex-col overflow-hidden rounded-lg border bg-app-surface transition-[border-color,background] duration-150 ease-in-out hover:border-[rgba(239,124,47,0.3)] hover:bg-[var(--surface-hover)]',
        STATUS_BORDER_CSS[derivedStatus],
      )}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
    >
      <div className="flex items-center gap-[7px] px-[9px] pb-[5px] pt-[7px]">
        <div className={cx('flex size-[26px] shrink-0 items-center justify-center rounded-md', STATUS_ICON_CSS[derivedStatus])}>
          {derivedStatus === 'completed'
            ? <CheckOne size={13} />
            : derivedStatus === 'failed'
              ? <CloseOne size={13} />
              : <Robot size={13} />
          }
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[10px] font-[750] uppercase tracking-[0.05em] text-app-text-muted">
            {agentType.replace(/_/g, ' ').replace(/-/g, ' ')}
          </span>
          <span className={cx('flex items-center gap-1 text-[10px] font-[650]', STATUS_TEXT_CSS[derivedStatus])}>
            {derivedStatus === 'running' && (
              <span className="flex animate-[spin_1s_linear_infinite]">
                <LoadingOne size={10} />
              </span>
            )}
            {derivedStatus === 'completed'
              ? 'Completed'
              : derivedStatus === 'failed'
                ? 'Failed'
                : isUntrackedBackgroundDispatch
                  ? 'Running in background…'
                  : 'Running…'
            }
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-[9px] pb-[7px]">
        {task && <div className="line-clamp-2 text-[12px] leading-[1.45] text-app-text">{task}</div>}
        {activeTool && (
          <div className="truncate rounded-[5px] border border-app-border-subtle bg-[rgba(255,255,255,0.04)] px-1.5 py-[3px] text-[10px] text-app-text-muted">
            {activeTool.toolName}{activeTool.message ? ` — ${activeTool.message}` : ''}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-app-border-subtle px-[9px] py-1.5">
        <span className="flex items-center gap-[3px] text-[10px] font-[650] text-[var(--accent-primary)]">View activity →</span>
        <div className="flex items-center gap-1.5">
          {tokens > 0 && (
            <span className="text-[10px] text-app-text-muted">{fmtTokens(tokens)}</span>
          )}
          {(turnNumber > 0 || derivedStatus === 'running') && (
            <span className="text-[10px] text-app-text-muted">{fmtElapsed(elapsedMs)}</span>
          )}
        </div>
      </div>
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
    <div className="flex w-full gap-[7px] overflow-x-auto pb-0.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-[3px] [&::-webkit-scrollbar-thumb]:bg-app-border-subtle">
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
