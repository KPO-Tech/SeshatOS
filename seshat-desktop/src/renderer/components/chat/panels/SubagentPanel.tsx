import { memo, useMemo, useRef, useEffect, useState } from 'react'
import { CloseOne } from '@icon-park/react'
import { streamingToContentBlocks, useSessionStore } from '@renderer/stores/session'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import { api } from '@renderer/api/client'
import { MessageItem } from '../messages/MessageItem'
import type { Message } from '@renderer/api/types'
import { useTranslation } from 'react-i18next'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type SubagentLifecycle = 'running' | 'completed' | 'failed'

const STATUS_DOT_CSS: Record<SubagentLifecycle, string> = {
  running: 'bg-[var(--accent-primary)] [animation:mode-dot-pulse_1.4s_ease-in-out_infinite]',
  completed: 'bg-app-success',
  failed: 'bg-app-error',
}

const STATUS_TEXT_CSS: Record<SubagentLifecycle, string> = {
  running: 'text-[var(--accent-primary)]',
  completed: 'text-app-success',
  failed: 'text-app-error',
}

type Props = {
  sessionId: string
  toolUseId: string
}

export const SubagentPanel = memo(function SubagentPanel({ sessionId, toolUseId }: Props) {
  const { t } = useTranslation('chat')
  const subagent = useSessionStore((s) => s.getSubagent(sessionId, toolUseId))
  const bottomRef = useRef<HTMLDivElement>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const streaming = subagent?.streaming ?? []
  const result = subagent?.result
  // The agent is read the way the chat is read: its prompt as a message of the person, what it wrote and
  // called as one message of the agent, drawn by the same component.
  const taskMessage = useMemo<Message | null>(
    () => (subagent?.task ? { id: `${toolUseId}-task`, role: 'user', content: [{ type: 'text', text: subagent.task }] } : null),
    [subagent?.task, toolUseId],
  )
  const answerMessage = useMemo<Message | null>(
    () => (streaming.length > 0 ? { id: `${toolUseId}-stream`, role: 'assistant', content: streamingToContentBlocks(streaming) } : null),
    [streaming, toolUseId],
  )
  // The final report is often the last thing the agent wrote already: it is not drawn twice.
  const lastWritten = [...streaming].reverse().find((block) => block.type === 'text')
  const alreadyWritten = Boolean(result?.trim()) && lastWritten?.type === 'text' && lastWritten.text.includes(result!.trim().slice(0, 200))
  const hasTerminalOutputState = Boolean(result?.trim()) || (subagent != null && subagent.status !== 'running')
  const showFinalOutput = hasTerminalOutputState && !alreadyWritten

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

  // The transcript follows what the agent writes, the way the chat does.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [streaming])

  if (!subagent) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-[22px] text-app-text-muted">
          <div className="size-[18px] rounded-full border-2 border-app-border-subtle border-t-[var(--accent-primary)] [animation:spin_0.9s_linear_infinite]" />
          <span className="text-[11px]">{t('chat.panels.subagentPanel.waitingForSubAgent')}</span>
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
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border-strong)] bg-transparent py-[3px] pl-[7px] pr-2 text-[10px] font-semibold tracking-[0.02em] text-app-text-secondary transition-[color,border-color,background] duration-150 disabled:cursor-default disabled:opacity-60 enabled:hover:border-app-error enabled:hover:bg-[rgba(var(--color-error-rgb),0.08)] enabled:hover:text-app-error"
              disabled={cancelling}
              onClick={handleCancel}
            >
              <CloseOne size={12} />
              {cancelling ? t('chat.panels.subagentPanel.cancelling') : t('chat.panels.subagentPanel.cancel')}
            </button>
          )}
        </div>

        {cancelError && <div className="mb-1.5 text-[10.5px] text-app-error">{cancelError}</div>}

        <div className="flex flex-wrap items-center gap-2 pb-[7px] text-[10px] text-app-text-muted">
          <span>
            {subagent.status === 'running' ? `${formatMs(durationMs)} elapsed` : formatMs(durationMs)}
          </span>
          {subagent.turnNumber > 0 && (
            <>
              <span className="opacity-30">·</span>
              <span>{t('chat.panels.subagentPanel.turns', { count: subagent.turnNumber })}</span>
            </>
          )}
          {subagent.inputTokens > 0 && (
            <>
              <span className="opacity-30">·</span>
              <span>
                {t('chat.panels.subagentPanel.tokensInOut', { input: subagent.inputTokens.toLocaleString(), output: subagent.outputTokens.toLocaleString() })}
              </span>
            </>
          )}
        </div>

      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-[3px] [&::-webkit-scrollbar-thumb]:bg-app-border-subtle [&::-webkit-scrollbar]:w-1">
        {taskMessage && <MessageItem message={taskMessage} sessionId={sessionId} isFirst />}
        {streaming.length === 0 && subagent.status === 'running' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-[22px] text-app-text-muted">
            <div className="size-[18px] rounded-full border-2 border-app-border-subtle border-t-[var(--accent-primary)] [animation:spin_0.9s_linear_infinite]" />
            <span className="text-[11px]">{t('chat.panels.subagentPanel.agentIsStarting')}</span>
          </div>
        )}
        {answerMessage && (
          <MessageItem
            message={answerMessage}
            sessionId={sessionId}
            compact
            endsTurn={subagent.status !== 'running'}
            revealThinking={subagent.status === 'running'}
            autoExpandTools
          />
        )}
        {showFinalOutput && (
          <FinalOutputSummary status={subagent.status} result={result} sessionId={sessionId} />
        )}
        <div ref={bottomRef} />

      </div>
    </div>
  )
})

function FinalOutputSummary({ status, result, sessionId }: { status: 'running' | 'completed' | 'failed'; result?: string; sessionId?: string }) {
  const { t } = useTranslation('chat')
  const hasResult = Boolean(result?.trim())
  return (
    <div className="mt-0.5 flex flex-col gap-1.5 border-t border-app-border-subtle pt-[9px]">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-app-text-muted">
        {status === 'failed' && <span className="text-[9px] font-bold leading-none text-app-error">{t('chat.panels.subagentPanel.failed')}</span>}
        <span>{t('chat.panels.subagentPanel.agentOutput')}</span>
      </div>
      {hasResult
        ? (
          <div className="text-[12px] leading-[1.6] text-app-text">
            <MarkdownView sessionId={sessionId}>{result ?? ''}</MarkdownView>
          </div>
        )
        : (
          <div className="text-[11px] text-app-text-muted">{t('chat.panels.subagentPanel.noFinalOutputWasCaptured')}</div>
        )
      }
    </div>
  )
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m${s > 0 ? ` ${s}s` : ''}`
}

