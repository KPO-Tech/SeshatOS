import { useMemo } from 'react'
import { DEFAULT_AGENT_STATE, EMPTY_STREAMING, useSessionStore } from '@renderer/stores/session'
import { isRenderableMessage } from '@renderer/components/chat/messages/MessageItem'
import { MessageList } from '@renderer/components/chat/messages/MessageList'
import { useLiveActivityForAgent } from '@renderer/components/chat/messages/liveActivity'
import { useConversationRuntimeActions } from '@renderer/components/chat/conversation/useConversationRuntimeActions'
import { useConversationScroll } from '@renderer/components/chat/conversation/useConversationScroll'
import { JumpToLatest } from '@renderer/components/chat/conversation/JumpToLatest'
import { RichActionProvider } from '@renderer/components/chat/richblocks/view/actions/richActions'
import type { Passage } from '../chat/knowledgeSearchResults'
import { askExtras, type OpenHow } from './askExtras'
import '@renderer/components/chat/conversation/ConversationPage.css'

type Props = {
  sessionId: string
  isStreaming: boolean
  sendMessage: (prompt: string) => void | Promise<unknown>
  // The name of the collection the questions are limited to, if they are.
  scopeName: string | null
  // A question asked again (the chat's retry and regenerate), with the scope the person now has.
  onAsk: (question: string) => void
  onOpenPassage: (passage: Passage, how: OpenHow) => void
}

// The conversation of the Ask view: the messages of the chat, drawn by the chat's own components (text, thinking, tool calls), with the
// citations of the answer and the documents it rests on added by askExtras.
export function AskConversation({ sessionId, isStreaming, sendMessage, scopeName, onAsk, onOpenPassage }: Props) {
  const session = useSessionStore((state) => state.sessions.find((item) => item.id === sessionId))
  const streaming = useSessionStore((state) => state.streamingBySession[sessionId] ?? EMPTY_STREAMING)
  const agentState = useSessionStore((state) => state.agentStates[sessionId] ?? DEFAULT_AGENT_STATE)
  const pendingPermission = agentState.pendingPermission
  const liveActivity = useLiveActivityForAgent(agentState)

  const messages = useMemo(() => {
    const all = session?.messages ?? []
    return all.filter((message, index) => isRenderableMessage(message) || (isStreaming && !pendingPermission && message.role === 'assistant' && index === all.length - 1))
  }, [session?.messages, isStreaming, pendingPermission])
  const extras = useMemo(() => askExtras(messages, scopeName, onOpenPassage), [messages, scopeName, onOpenPassage])

  const { onApproveTool, onDenyTool, onSubmitToolPrompt } = useConversationRuntimeActions({ sessionId, pendingPermission, sendMessage })
  const { scrollRef, rowVirtualizer, away, scrollToBottom } = useConversationScroll({ messageCount: messages.length, streaming })

  return (
    // A follow-up of a component (a Choice, a Button) is a question like the ones of the composer, with the scope the person has now.
    <RichActionProvider ask={onAsk} busy={isStreaming}>
    <div className="conv-root !bg-transparent">
      <MessageList
        sessionId={sessionId}
        messages={messages}
        scrollRef={scrollRef}
        rowVirtualizer={rowVirtualizer}
        isStreaming={isStreaming}
        pendingPermission={pendingPermission}
        pendingAskUser={null}
        liveActivity={liveActivity}
        justCompleted={false}
        onApproveTool={onApproveTool}
        onDenyTool={onDenyTool}
        onSubmitToolPrompt={onSubmitToolPrompt}
        onRetryMessage={(text) => onAsk(text)}
        extrasFor={(index) => extras[index]}
      />
      <JumpToLatest away={away} onJump={scrollToBottom} />
    </div>
    </RichActionProvider>
  )
}
