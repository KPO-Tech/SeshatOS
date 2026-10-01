import { memo, useRef, useEffect, useState } from 'react'
import { CloseOne } from '@icon-park/react'
import { useSessionStore } from '@renderer/stores/session'
import { MarkdownView } from '@renderer/components/MarkdownView'
import { api } from '@renderer/api/client'
import { ToolBlock } from '../tools/ToolBlock'
import { AgentCardsRow } from '../tools/AgentToolView'
import { QuietToolGroup } from '../tools/QuietToolGroup'
import { groupBlocks } from '../messages/MessageItem'
import type { ToolStatus } from '@renderer/api/types'
import type { ToolActivity } from '@renderer/stores/session'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type SubagentLifecycle = 'running' | 'completed' | 'failed'

const STATUS_DOT_CSS: Record<SubagentLifecycle, string> = {
  running: 'bg-[var(--color-accent)] [animation:mode-dot-pulse_1.4s_ease-in-out_infinite]',
  completed: 'bg-app-success',
  failed: 'bg-app-error',
}

const STATUS_TEXT_CSS: Record<SubagentLifecycle, string> = {
  running: 'text-[var(--color-accent)]',
  completed: 'text-app-success',
  failed: 'text-app-error',
}

const ACTIVITY_DOT_CSS: Record<ToolActivity['stage'], string> = {
  pending: 'bg-[var(--color-accent)]',
  running: 'bg-[var(--color-accent)]',
  completed: 'bg-app-success',
  failed: 'bg-app-error',
}

type Tab = 'activity' | 'output'

type Props = {
  sessionId: string
  toolUseId: string
}

export const SubagentPanel = memo(function SubagentPanel({ sessionId, toolUseId }: Props) {
  const subagent = useSessionStore((s) => s.getSubagent(sessionId, toolUseId))
  const [tab, setTab] = useState<Tab>('activity')
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevResultRef = useRef<string | undefined>(undefined)
  const [outputReady, setOutputReady] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const streaming = subagent?.streaming ?? []
  const result = subagent?.result
  const hasResult = Boolean(result?.trim())
  const hasTerminalOutputState = hasResult || (subagent != null && subagent.status !== 'running')

  // No optimistic local status update here — CloseAgent on the backend cancels
  // the agent's context, which makes its own completion notifier fire the
  // usual tool.progress(failed) event over SSE (see spawn_agent.go), so the
  // status transition arrives the same way a natural failure would. This
  // button just triggers that and surfaces a request-level error if the POST
  // itself fails (e.g. already finished, or a network drop).
  const handleCancel = async () => {
    if (!subagent?.agentId || cancelling) return
    setCancelling(true)
    setCancelError(null)
    try {
      await api.post(`/subagents/${subagent.agentId}/cancel`, { session_id: sessionId })
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel agent')
    } finally {
      setCancelling(false)
    }
  }

  // Auto-scroll activity tab as new blocks arrive
  useEffect(() => {
    if (tab === 'activity') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streaming.length, tab])

  // When result first appears, light up the Output tab dot
  useEffect(() => {
    if (hasResult && result && prevResultRef.current === undefined) {
      setOutputReady(true)
      const id = setTimeout(() => setOutputReady(false), 4000)
      prevResultRef.current = result
      return () => clearTimeout(id)
    }
  }, [hasResult, result])

  const handleTabClick = (t: Tab) => {
    setTab(t)
    if (t === 'output') setOutputReady(false)
  }

  if (!subagent) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-[22px] text-app-text-muted">
          <div className="size-[18px] rounded-full border-2 border-app-border-subtle border-t-[var(--color-accent)] [animation:spin_0.9s_linear_infinite]" />
          <span className="text-[11px]">Waiting for sub-agent…</span>
        </div>
      </div>
    )
  }

  const durationMs = subagent.endedAt
    ? subagent.endedAt - subagent.startedAt
    : Date.now() - subagent.startedAt

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col border-b border-app-border-subtle px-[11px] pt-2.5">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className={cx('size-[7px] shrink-0 rounded-full', STATUS_DOT_CSS[subagent.status])} />
          <span className={cx('text-[10px] font-bold uppercase tracking-[0.07em]', STATUS_TEXT_CSS[subagent.status])}>
            {subagent.agentType.replace(/_/g, ' ').replace(/-/g, ' ')}
          </span>
          {subagent.status === 'running' && subagent.agentId && (
            <button
              type="button"
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-full border border-[var(--color-border)] bg-transparent py-[3px] pl-[7px] pr-2 text-[10px] font-semibold tracking-[0.02em] text-app-text-secondary transition-[color,border-color,background] duration-150 disabled:cursor-default disabled:opacity-60 enabled:hover:border-app-error enabled:hover:bg-[rgba(var(--color-error-rgb),0.08)] enabled:hover:text-app-error"
              disabled={cancelling}
              onClick={handleCancel}
            >
              <CloseOne size={12} />
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>

        {cancelError && <div className="mb-1.5 text-[10.5px] text-app-error">{cancelError}</div>}

        {subagent.task && <div className="mb-2 text-[11px] leading-[1.5] text-app-text">{subagent.task}</div>}

        <div className="flex flex-wrap items-center gap-2 pb-[7px] text-[10px] text-app-text-muted">
          <span>
            {subagent.status === 'running' ? `${formatMs(durationMs)} elapsed` : formatMs(durationMs)}
          </span>
          {subagent.turnNumber > 0 && (
            <>
              <span className="opacity-30">·</span>
              <span>{subagent.turnNumber} turn{subagent.turnNumber > 1 ? 's' : ''}</span>
            </>
          )}
          {subagent.inputTokens > 0 && (
            <>
              <span className="opacity-30">·</span>
              <span>
                {subagent.inputTokens.toLocaleString()} in / {subagent.outputTokens.toLocaleString()} out
              </span>
            </>
          )}
        </div>

        <div className="mt-auto flex border-t border-app-border-subtle">
          <button
            className={cx(
              'flex flex-1 items-center justify-center gap-1 border-0 border-b-2 border-b-transparent bg-transparent py-1.5 text-[10px] font-semibold text-app-text-muted transition-colors duration-150 cursor-pointer',
              tab === 'activity' ? 'border-b-[var(--color-accent)] text-[var(--color-accent)]' : 'hover:text-app-text-secondary',
            )}
            type="button"
            onClick={() => handleTabClick('activity')}
          >
            Activity
          </button>
          <button
            className={cx(
              'flex flex-1 items-center justify-center gap-1 border-0 border-b-2 border-b-transparent bg-transparent py-1.5 text-[10px] font-semibold text-app-text-muted transition-colors duration-150',
              tab === 'output'
                ? 'cursor-pointer border-b-[var(--color-accent)] text-[var(--color-accent)]'
                : hasTerminalOutputState ? 'cursor-pointer hover:text-app-text-secondary' : 'cursor-not-allowed opacity-[0.38]',
            )}
            type="button"
            disabled={!hasTerminalOutputState}
            onClick={() => hasTerminalOutputState && handleTabClick('output')}
          >
            {outputReady && tab !== 'output' && <span className="size-1.5 shrink-0 rounded-full bg-app-success [animation:mode-dot-pulse_1.2s_ease-in-out_infinite]" />}
            Output
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-[3px] [&::-webkit-scrollbar-thumb]:bg-app-border-subtle [&::-webkit-scrollbar]:w-1">
        {tab === 'activity' && (
          <div className="flex flex-1 flex-col gap-2 p-2.5">
            {streaming.length === 0 && subagent.status === 'running' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-[22px] text-app-text-muted">
                <div className="size-[18px] rounded-full border-2 border-app-border-subtle border-t-[var(--color-accent)] [animation:spin_0.9s_linear_infinite]" />
                <span className="text-[11px]">Agent is starting…</span>
              </div>
            )}
            {groupBlocks(streaming, toolUseId).map((item, i) => {
              if (item.kind === 'agent-group') {
                return (
                  <AgentCardsRow
                    key={`${toolUseId}-agents-${i}`}
                    tools={item.tools}
                    sessionId={sessionId}
                    getStatus={(t) => (t._status ?? (t._result ? (t._result.isError ? 'failed' : 'completed') : 'running')) as ToolStatus}
                  />
                )
              }
              if (item.kind === 'quiet-group') {
                const firstToolId = item.items.find((it) => it.kind === 'tool')?.tool.id
                return (
                  <QuietToolGroup
                    key={firstToolId || `${toolUseId}-quiet-${i}`}
                    items={item.items}
                    sessionId={sessionId}
                  />
                )
              }
              return <StreamBlockView key={`${toolUseId}-block-${i}`} block={item.block} sessionId={sessionId} />
            })}
            {subagent.activeTool && (
              <div className="flex items-center gap-1.5 rounded-md border border-[rgba(239,124,47,0.25)] bg-[rgba(239,124,47,0.06)] px-[7px] py-1.5 text-[10px] text-[var(--color-accent)]">
                <div className="size-3 shrink-0 rounded-full border-2 border-[rgba(239,124,47,0.25)] border-t-[var(--color-accent)] [animation:spin_0.9s_linear_infinite]" />
                <span>
                  <strong>{subagent.activeTool.toolName}</strong>
                  {subagent.activeTool.message ? ` — ${subagent.activeTool.message}` : ''}
                </span>
              </div>
            )}
            {subagent.activityLog.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase text-app-text-muted">Tool log</span>
                {subagent.activityLog.slice(-10).reverse().map((entry, index) => (
                  <div key={`${entry.toolName}-${entry.startedAt}-${index}`} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-[7px] py-1">
                    <span className={cx('mt-[5px] size-1.5 rounded-full', ACTIVITY_DOT_CSS[entry.stage] ?? 'bg-[var(--color-border)]')} />
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="text-[10.5px] font-semibold text-app-text">{entry.toolName.replace(/_/g, ' ')}</span>
                      {entry.message && <span className="truncate text-[10px] text-app-text-muted">{entry.message}</span>}
                    </span>
                    <span className="text-[10px] text-app-text-muted">{formatActivityDuration(entry)}</span>
                  </div>
                ))}
              </div>
            )}
            {hasTerminalOutputState && (
              <FinalOutputSummary status={subagent.status} result={result} sessionId={sessionId} />
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {tab === 'output' && (
          <div className="flex flex-1 flex-col gap-2 p-2.5">
            {hasResult
              ? (
                <div className="text-[12px] leading-[1.6] text-app-text">
                  <MarkdownView sessionId={sessionId}>{result ?? ''}</MarkdownView>
                </div>
              )
              : (
                <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-[22px] text-center text-[11px] text-app-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    {subagent.status === 'failed' && <span className="text-[9px] font-bold leading-none text-app-error">failed</span>}
                    <span>{subagent.status === 'running' ? 'Output will appear here once the agent finishes.' : 'No final output was captured.'}</span>
                  </span>
                </div>
              )
            }
          </div>
        )}
      </div>
    </div>
  )
})

function FinalOutputSummary({ status, result, sessionId }: { status: 'running' | 'completed' | 'failed'; result?: string; sessionId?: string }) {
  const hasResult = Boolean(result?.trim())
  return (
    <div className="mt-0.5 flex flex-col gap-1.5 border-t border-app-border-subtle pt-[9px]">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-app-text-muted">
        {status === 'failed' && <span className="text-[9px] font-bold leading-none text-app-error">failed</span>}
        <span>Agent output</span>
      </div>
      {hasResult
        ? (
          <div className="text-[12px] leading-[1.6] text-app-text">
            <MarkdownView sessionId={sessionId}>{result ?? ''}</MarkdownView>
          </div>
        )
        : (
          <div className="text-[11px] text-app-text-muted">No final output was captured.</div>
        )
      }
    </div>
  )
}

function StreamBlockView({ block, sessionId }: { block: Parameters<typeof groupBlocks>[0][number]; sessionId?: string }) {
  if (block.type === 'tool_result') return null

  if (block.type === 'text') {
    if (!block.text.trim()) return null
    return (
      <div className="text-[12px] leading-[1.6] text-app-text">
        <MarkdownView sessionId={sessionId}>{block.text}</MarkdownView>
      </div>
    )
  }

  if (block.type === 'thinking') {
    if (!block.thinking.trim()) return null
    return (
      <div className="border-l-2 border-[rgba(239,124,47,0.22)] pl-2 text-[11px] italic leading-[1.55] text-app-text-muted">{block.thinking}</div>
    )
  }

  if (block.type === 'tool_use') {
    return (
      <ToolBlock
        tool={{
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
          metadata: block.metadata,
          _status: block._status,
          _result: block._result,
          _approval: block._approval,
          _prompt: block._prompt,
          _partialInput: block._partialInput,
          _message: block._message,
        }}
      />
    )
  }

  return null
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m${s > 0 ? ` ${s}s` : ''}`
}

function formatActivityDuration(entry: ToolActivity): string {
  if (!entry.endedAt) return 'now'
  return formatMs(Math.max(0, entry.endedAt - entry.startedAt))
}
