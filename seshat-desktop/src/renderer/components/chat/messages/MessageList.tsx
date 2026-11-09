import { useMemo, type RefObject } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { Message } from '@renderer/api/types'
import type { ChatAttachment } from '@renderer/stores/session'
import { changedFilesByTurnEnd } from '@renderer/lib/changedFiles'
import { webSourcesByTurnEnd, webSourcesSoFar } from '@renderer/lib/webSources'
import { useStableEntries } from '@renderer/lib/stableEntries'
import { MessageItem, userPrompt } from '@renderer/components/chat/messages/MessageItem'
import { layoutTurns, listRows, type ListRow } from '@renderer/components/chat/messages/turns'
import { useUIStore } from '@renderer/stores/ui'
import type { AnswerExtras } from '@renderer/components/chat/messages/answerExtras'
import { useTranslation } from 'react-i18next'

type LiveActivity = {
  label: string
  detail?: string
}

type MessageListProps = {
  sessionId?: string
  messages: Message[]
  scrollRef: RefObject<HTMLDivElement | null>
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>
  blurred?: boolean
  isStreaming: boolean
  pendingPermission: unknown
  pendingAskUser: unknown
  liveActivity: LiveActivity
  justCompleted: boolean
  onApproveTool: (toolUseId: string, remember?: boolean) => void
  onDenyTool: (toolUseId: string) => void
  onSubmitToolPrompt: (promptId: string, value: unknown) => void
  onRetryMessage: (text: string, attachments?: ChatAttachment[]) => void
  // What a host surface adds under message i (see answerExtras.ts); the chat adds nothing.
  extrasFor?: (index: number) => AnswerExtras | undefined
}

/** What a message carries, moved onto the row that draws it. */
function byRow<T>(rows: ListRow[], perMessage: Map<number, T>): Map<number, T> {
  const out = new Map<number, T>()
  rows.forEach((row, index) => {
    if (row.merged) return
    for (const messageIndex of row.indexes) {
      const value = perMessage.get(messageIndex)
      if (value !== undefined) out.set(index, value)
    }
  })
  return out
}

export function MessageList({
  sessionId,
  messages,
  scrollRef,
  rowVirtualizer,
  blurred = false,
  isStreaming,
  pendingPermission,
  pendingAskUser,
  liveActivity,
  justCompleted,
  onApproveTool,
  onDenyTool,
  onSubmitToolPrompt,
  onRetryMessage,
  extrasFor,
}: MessageListProps) {
  // The files each turn created or edited, listed under the message that ends the turn.
  // Each list is kept identical while its content does not change, so that a streamed token only draws the message it lands in.
  const { t } = useTranslation('chat')
  // The runtime writes a message per step. The consecutive ones that hold nothing but
  // calls are drawn as one row, so their calls read as a single run.
  const rows = useMemo(() => listRows(messages), [messages])
  const changedFiles = useStableEntries(useMemo(() => byRow(rows, changedFilesByTurnEnd(messages, isStreaming)), [rows, messages, isStreaming]))
  // The web pages behind each answer, listed under it.
  const webSources = useStableEntries(useMemo(() => byRow(rows, webSourcesByTurnEnd(messages, isStreaming)), [rows, messages, isStreaming]))
  // The pages consulted so far in the turn, to tell which links of an answer are citations.
  const consulted = useStableEntries(useMemo(() => byRow(rows, webSourcesSoFar(messages)), [rows, messages]))
  // Which steps of each turn fold behind its "Worked for ..." header. Nothing
  // folds until the reader asks for it: in a coding session the trace of the
  // turn is often what they are reading.
  const condenseTurns = useUIStore((state) => state.condenseTurns)
  // Turns are laid out on the rows the list draws, not on the raw messages: a step merged into an earlier
  // row draws nothing, so a fold hung on it would hide the whole run.
  const turnLayout = useMemo(() => {
    if (!condenseTurns) return []
    const drawn = rows.map((row, index) => ({ row, index })).filter((entry) => !entry.row.merged)
    const layout = layoutTurns(drawn.map((entry) => entry.row.message))
    const out: Array<(typeof layout)[number] | undefined> = rows.map(() => undefined)
    drawn.forEach((entry, position) => {
      const item = layout[position]
      out[entry.index] = { ...item, turnStart: drawn[item.turnStart]?.index ?? entry.index }
    })
    return out
  }, [condenseTurns, rows])
  // The row that holds the newest message, and the last row an assistant draws: where the live turn is.
  const lastMessageRow = rows.findIndex((row) => row.indexes.includes(messages.length - 1))
  let lastAssistantRow = -1
  rows.forEach((row, index) => { if (!row.merged && row.message.role === 'assistant') lastAssistantRow = index })

  // An answer can be asked again from the prompt before it, unless a turn is running. One function per answer, kept between renders.
  const regenerators = useMemo(() => {
    const out = new Map<number, () => void>()
    if (isStreaming) return out
    for (let index = 0; index < messages.length; index++) {
      if (messages[index].role !== 'assistant') continue
      for (let i = index - 1; i >= 0; i--) {
        if (messages[i].role !== 'user') continue
        const { text, attachments } = userPrompt(messages[i])
        if (!text.trim()) continue
        out.set(index, () => onRetryMessage(text, attachments))
        break
      }
    }
    return out
  }, [messages, isStreaming, onRetryMessage])

  if (messages.length === 0) {
    return (
      <div className={`conv-messages${blurred ? ' conv-messages--blurred' : ''}`} ref={scrollRef}>
        <div className="conv-empty">
          <p className="m-0 text-[13px] text-app-text-muted">{t('chat.messages.messageList.sendAMessageToStart')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`conv-messages${blurred ? ' conv-messages--blurred' : ''}`} ref={scrollRef}>
      <div
        className="conv-messages-inner"
        style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index]
          const msg = row.message
          const i = virtualRow.index
          const revealThinking = isStreaming && msg.role === 'assistant' && i === lastMessageRow
          const showLiveActivity = revealThinking && !pendingPermission && !pendingAskUser
          const showCompleted = justCompleted && msg.role === 'assistant' && i === lastMessageRow && !pendingPermission && !pendingAskUser
          const turn = turnLayout[i]
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="conv-virtual-row"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${virtualRow.start}px)` }}
            >
              <MessageItem
                message={msg}
                sessionId={sessionId}
                isFirst={i === 0}
                folded={turn?.folded || row.merged}
                foldedMessages={turn?.foldedMessages}
                turnKey={`${sessionId ?? ''}:turn-${turn?.turnStart ?? i}`}
                liveTurn={isStreaming && i === lastAssistantRow}
                compact={msg.role === 'assistant' && i > 0 && messages[i - 1]?.role === 'assistant'}
                revealThinking={revealThinking}
                liveActivity={showLiveActivity ? liveActivity : undefined}
                justCompleted={showCompleted}
                changedFiles={changedFiles.get(i)}
                webSources={webSources.get(i)}
                consultedPages={consulted.get(i)}
                extras={extrasFor?.(i)}
                onApproveTool={onApproveTool}
                onDenyTool={onDenyTool}
                onSubmitToolPrompt={onSubmitToolPrompt}
                onRetryMessage={onRetryMessage}
                onRegenerate={regenerators.get(i)}
                endsTurn={messages[i + 1]?.role !== 'assistant'}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
