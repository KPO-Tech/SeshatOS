import type { WebSource } from '@renderer/lib/webSources'
import { SiteIcon } from './SiteIcon'
import type { SourceItem } from './sourceItem'

// The web pages behind an answer as a list of sources: the logo of the site, the title of the page, the site.
export function webSourceItems(sources: readonly WebSource[]): SourceItem[] {
  return sources.map((source) => ({
    key: source.url,
    title: source.title || source.domain || source.url,
    meta: source.domain,
    href: source.url,
    mark: (size) => <SiteIcon domain={source.domain} fallback={(source.title || source.domain || 'S').trim().charAt(0).toUpperCase()} size={size} />
  }))
}
