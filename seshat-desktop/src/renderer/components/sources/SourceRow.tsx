import { openInAppBrowser, shouldOpenInAppBrowser } from '@renderer/lib/openInAppBrowser'
import type { SourceItem } from './sourceItem'

const ROW =
  'flex w-full cursor-pointer items-center gap-2.5 border-0 border-b border-solid border-[var(--border-soft)] bg-transparent px-3 py-2 text-left no-underline transition-colors duration-150 last:border-b-0 hover:bg-[color-mix(in_srgb,var(--accent-primary)_7%,transparent)]'

// One line of the list of sources: the mark, the title, and on the right where it comes from.
export function SourceRow({ item, sessionId }: { item: SourceItem; sessionId?: string }) {
  const className = `${ROW} ${item.active ? 'bg-[var(--accent-subtle)]' : ''}`
  const place = [item.meta, item.trailing].filter(Boolean).join(' · ')
  const content = (
    <>
      {item.mark(18)}
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--text-primary)]">{item.title}</span>
      {place && <span className="max-w-[200px] shrink-0 truncate text-[11px] text-[var(--text-muted)]">{place}</span>}
    </>
  )

  if (item.href) {
    const href = item.href
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          if (!shouldOpenInAppBrowser(event, href)) return
          event.preventDefault()
          openInAppBrowser(href, sessionId)
        }}
      >
        {content}
      </a>
    )
  }
  return (
    <button type="button" className={className} onClick={item.onOpen}>
      {content}
    </button>
  )
}
