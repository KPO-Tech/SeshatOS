import { memo, useMemo, type ComponentProps } from 'react'
import { useSessionStore } from '@renderer/stores/session'
import { streamingToContentBlocks } from '@renderer/components/chat/state/streamingContent'
import { MessageItem } from './MessageItem'

type Props = ComponentProps<typeof MessageItem>

/**
 * The answer being written, drawn from the streaming blocks of its session. It is the only row that reads them: the rest of the
 * conversation (and of the app) keeps the same messages while the answer streams, so a token draws this row and nothing else.
 * Once the turn ends the blocks are cleared and the committed message is drawn as any other.
 */
export const LiveMessageItem = memo(function LiveMessageItem(props: Props) {
  const { sessionId, message } = props
  const streaming = useSessionStore((state) => (sessionId ? state.streamingBySession[sessionId] : undefined))
  const live = useMemo(() => {
    if (!streaming || streaming.length === 0) return message
    return { ...message, content: streamingToContentBlocks(streaming) }
  }, [message, streaming])
  return <MessageItem {...props} message={live} />
})
