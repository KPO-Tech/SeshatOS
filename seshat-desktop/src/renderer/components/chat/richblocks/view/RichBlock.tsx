import { useMemo, type ReactNode } from 'react'
import { parseUi } from '../lang/parseUi'
import { NodeView } from './NodeView'
import { RichLinkProvider, type LinkRenderer } from './links/richLinks'

type Props = {
  code: string
  streaming: boolean
  /** What to show when the block holds nothing drawable once it is complete: the raw text. */
  fallback: ReactNode
  /** How the answer that holds the block draws its links (a citation chip): the text inside components uses it too. */
  renderLink?: LinkRenderer
}

export function RichBlock({ code, streaming, fallback, renderLink }: Props) {
  const result = useMemo(() => parseUi(code, { streaming }), [code, streaming])

  if (!result.root) {
    if (streaming) return <div aria-hidden="true" className="my-3 h-16 animate-pulse rounded-lg bg-app-surface" />
    return <>{fallback}</>
  }
  return (
    <div className="seshat-ui my-4" data-ui-errors={result.errors.length > 0 ? result.errors.length : undefined}>
      <RichLinkProvider render={renderLink}>
        <NodeView node={result.root} />
      </RichLinkProvider>
    </div>
  )
}
