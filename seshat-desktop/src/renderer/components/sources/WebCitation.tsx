import { openInAppBrowser } from '@renderer/lib/openInAppBrowser'
import type { WebSource } from '@renderer/lib/webSources'
import { CitationChip } from './CitationChip'
import { SiteIcon } from './SiteIcon'

// A link in an answer to a page the agent actually consulted: the logo and the name of the site, with the title of the page on hover.
export function WebCitation({ source, sessionId }: { source: WebSource; sessionId?: string }) {
  const initial = (source.title || source.domain || 'S').trim().charAt(0).toUpperCase()
  const mark = (size: number) => <SiteIcon domain={source.domain} fallback={initial} size={size} />
  return (
    <CitationChip
      mark={mark(16)}
      label={source.domain || source.title}
      onOpen={() => openInAppBrowser(source.url, sessionId)}
      preview={{ title: source.title || source.domain, meta: source.url, action: 'Open the page', mark }}
    />
  )
}
