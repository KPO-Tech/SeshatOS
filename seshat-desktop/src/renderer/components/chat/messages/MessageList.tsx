import type { RefObject } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { Message } from '@renderer/api/types'
import type { ChatAttachment } from '@renderer/stores/session'
import { MessageItem } from '@renderer/components/chat/messages/MessageItem'

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
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className={`conv-messages${blurred ? ' conv-messages--blurred' : ''}`} ref={scrollRef}>
        <div className="conv-empty">
          <p className="m-0 text-[13px] text-app-text-muted">Send a message to start this conversation.</p>
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
          const autoExpandTools = revealThinking
          const showLiveActivity = revealThinking && !pendingPermission && !pendingAskUser
          const showCompleted = justCompleted && msg.role === 'assistant' && i === messages.length - 1 && !pendingPermission && !pendingAskUser
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
                compact={msg.role === 'assistant' && i > 0 && messages[i - 1]?.role === 'assistant'}
                revealThinking={revealThinking}
                autoExpandTools={autoExpandTools}
                liveActivity={showLiveActivity ? liveActivity : undefined}
                justCompleted={showCompleted}
                onApproveTool={onApproveTool}
                onDenyTool={onDenyTool}
                onSubmitToolPrompt={onSubmitToolPrompt}
                onRetryMessage={onRetryMessage}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
