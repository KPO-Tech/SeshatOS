import { useRef, useState } from 'react'
import { Down } from '@icon-park/react'
import { SourceRow } from './SourceRow'
import type { SourceItem } from './sourceItem'

// The sources of an answer, in one card at its end. Folded, the card is its header: the marks of the first sources and how many
// there are. Unfolded, the list of sources opens under it as lines.
export function SourcesDisclosure({ items, sessionId }: { items: SourceItem[]; sessionId?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  if (items.length === 0) return null

  return (
    <div ref={root} className="mt-5 w-full max-w-[560px] overflow-hidden rounded-xl border border-solid border-[var(--border-soft)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value)
          // Once the list has unfolded, bring its end into view above the composer.
          if (!open) setTimeout(() => root.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 320)
        }}
        className="flex h-10 w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 text-left text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <span className="flex -space-x-1">
          {items.slice(0, 3).map((item) => (
            <span key={item.key} className="rounded-full ring-2 ring-[var(--chat-bg,var(--surface-root))]">
              {item.mark(18)}
            </span>
          ))}
        </span>
        <span className="flex-1">
          {items.length} {items.length === 1 ? 'source' : 'sources'}
        </span>
        <Down size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-0 border-t border-solid border-[var(--border-soft)]" inert={!open}>
            {items.map((item) => (
              <SourceRow key={item.key} item={item} sessionId={sessionId} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
