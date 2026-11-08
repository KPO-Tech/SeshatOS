import { useMemo, type RefObject } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { Message } from '@renderer/api/types'
import type { ChatAttachment } from '@renderer/stores/session'
import { changedFilesByTurnEnd } from '@renderer/lib/changedFiles'
import { webSourcesByTurnEnd, webSourcesSoFar } from '@renderer/lib/webSources'
import { useStableEntries } from '@renderer/lib/stableEntries'
import { MessageItem, userPrompt } from '@renderer/components/chat/messages/MessageItem'
import { layoutTurns } from '@renderer/components/chat/messages/turns'
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
  const changedFiles = useStableEntries(useMemo(() => changedFilesByTurnEnd(messages, isStreaming), [messages, isStreaming]))
  // The web pages behind each answer, listed under it.
  const webSources = useStableEntries(useMemo(() => webSourcesByTurnEnd(messages, isStreaming), [messages, isStreaming]))
  // The pages consulted so far in the turn, to tell which links of an answer are citations.
  const consulted = useStableEntries(useMemo(() => webSourcesSoFar(messages), [messages]))
  // Which steps of each turn fold behind its "Worked for ..." header. Nothing
  // folds until the reader asks for it: in a coding session the trace of the
  // turn is often what they are reading.
  const condenseTurns = useUIStore((state) => state.condenseTurns)
  const turnLayout = useMemo(() => (condenseTurns ? layoutTurns(messages) : []), [condenseTurns, messages])

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
          const msg = messages[virtualRow.index]
          const i = virtualRow.index
          const revealThinking = isStreaming && msg.role === 'assistant' && i === messages.length - 1
          const showLiveActivity = revealThinking && !pendingPermission && !pendingAskUser
          const showCompleted = justCompleted && msg.role === 'assistant' && i === messages.length - 1 && !pendingPermission && !pendingAskUser
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
                folded={turn?.folded}
                foldedMessages={turn?.foldedMessages}
                turnKey={`${sessionId ?? ''}:turn-${turn?.turnStart ?? i}`}
                liveTurn={revealThinking}
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
