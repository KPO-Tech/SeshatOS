import { useMemo, type ReactNode } from 'react'
import { parseUi } from '../lang/parseUi'
import { NodeView } from './NodeView'

type Props = {
  code: string
  streaming: boolean
  /** What to show when the block holds nothing drawable once it is complete: the raw text. */
  fallback: ReactNode
}

export function RichBlock({ code, streaming, fallback }: Props) {
  const result = useMemo(() => parseUi(code, { streaming }), [code, streaming])

  if (!result.root) {
    if (streaming) return <div aria-hidden="true" className="my-3 h-16 animate-pulse rounded-lg bg-app-surface" />
    return <>{fallback}</>
  }
  return (
    <div className="seshat-ui my-4" data-ui-errors={result.errors.length > 0 ? result.errors.length : undefined}>
      <NodeView node={result.root} />
    </div>
  )
}
