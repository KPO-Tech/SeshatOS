import { useMemo, useRef, type ReactNode } from 'react'
import { parseUi } from '../lang/parseUi'
import { wantsWidth } from './breakout/chatBreakout'
import { useChatBreakout } from './breakout/useChatBreakout'
import { NodeView } from './NodeView'

type Props = {
  code: string
  streaming: boolean
  /** What to show when the block holds nothing drawable once it is complete: the raw text. */
  fallback: ReactNode
}

export function RichBlock({ code, streaming, fallback }: Props) {
  const result = useMemo(() => parseUi(code, { streaming }), [code, streaming])
  const frame = useRef<HTMLDivElement>(null)
  // A table or a drawing goes a little beyond the text column of the chat, which keeps its width.
  const extra = useChatBreakout(frame, wantsWidth(result.root))

  if (!result.root) {
    if (streaming) return <div aria-hidden="true" className="my-3 h-16 animate-pulse rounded-lg bg-app-surface" />
    return <>{fallback}</>
  }
  return (
    <div
      ref={frame}
      className="seshat-ui my-4"
      style={extra > 0 ? { marginLeft: -extra, marginRight: -extra } : undefined}
      data-ui-errors={result.errors.length > 0 ? result.errors.length : undefined}
    >
      <NodeView node={result.root} />
    </div>
  )
}
