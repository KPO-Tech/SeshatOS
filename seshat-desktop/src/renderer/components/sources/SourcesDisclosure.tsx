import { useRef, useState } from 'react'
import { Down } from '@icon-park/react'
import { SourceRow } from './SourceRow'
import type { SourceItem } from './sourceItem'

// The sources of an answer, folded at its end: a row that names how many there are, and opens the list when clicked.
export function SourcesDisclosure({ items, sessionId }: { items: SourceItem[]; sessionId?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  if (items.length === 0) return null

  return (
    <div ref={root} className="mt-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value)
          // Once the list has unfolded, bring its end into view above the composer.
          if (!open) setTimeout(() => root.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 320)
        }}
        className="flex h-9 cursor-pointer items-center gap-2.5 rounded-full border border-solid border-[var(--border-soft)] bg-transparent pl-2 pr-3.5 text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        <span className="flex -space-x-1">
          {items.slice(0, 3).map((item) => (
            <span key={item.key} className="rounded-[8px] ring-2 ring-[var(--chat-bg,var(--surface-root))]">
              {item.mark(20)}
            </span>
          ))}
        </span>
        <span>
          {items.length} {items.length === 1 ? 'source' : 'sources'}
        </span>
        <Down size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="pt-3" inert={!open}>
            <div className="grid gap-2">
              {items.map((item, index) => (
                <SourceRow key={item.key} item={item} sessionId={sessionId} delay={index * 60} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
