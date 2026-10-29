import { useMemo } from 'react'
import { SessionOverview } from '@renderer/components/chat/panels/SessionOverview'
import { useSessionStore } from '@renderer/stores/session'

const NO_MESSAGES: never[] = []

// The column on the right of the Ask screen while a conversation is open: the chat's own cards (context with its compaction, environment,
// activity), drawn like the ones that were there before the first question.
export function AskSessionSidebar({ sessionId }: { sessionId: string }) {
  const messages = useSessionStore((state) => state.sessions.find((item) => item.id === sessionId)?.messages) ?? NO_MESSAGES
  const toolCount = useMemo(() => messages.reduce((total, message) => total + message.content.filter((block) => block.type === 'tool_use').length, 0), [messages])

  return (
    <aside aria-label="This conversation" className="no-scrollbar flex min-h-0 w-[300px] shrink-0 flex-col gap-3 overflow-y-auto">
      <SessionOverview sessionId={sessionId} toolCount={toolCount} webCount={0} variant="ask" />
    </aside>
  )
}
