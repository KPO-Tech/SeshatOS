import { openInAppBrowser, shouldOpenInAppBrowser } from '@renderer/lib/openInAppBrowser'
import type { SourceItem } from './sourceItem'

const ROW =
  'flex w-full cursor-pointer items-center gap-3 rounded-xl border border-solid bg-transparent px-3 py-2.5 text-left no-underline transition-[border-color,background-color] duration-150 hover:bg-[var(--surface-hover)]'

export function SourceRow({ item, sessionId, delay = 0 }: { item: SourceItem; sessionId?: string; delay?: number }) {
  const className = `${ROW} ${item.active ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-soft)]'}`
  const style = { animation: `slide-up 320ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both` }
  const content = (
    <>
      {item.mark(30)}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{item.title}</span>
        <span className="block truncate text-[11px] text-[var(--text-muted)]">{item.meta}</span>
      </span>
      {item.trailing && <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{item.trailing}</span>}
    </>
  )

  if (item.href) {
    const href = item.href
    return (
      <a
        className={className}
        style={style}
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
    <button type="button" className={className} style={style} onClick={item.onOpen}>
      {content}
    </button>
  )
}
