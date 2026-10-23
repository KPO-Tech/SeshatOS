import { useRef, useState, type ReactNode } from 'react'
import { Down } from '@icon-park/react'
import { SourceRow } from './SourceRow'
import type { SourceItem } from './sourceItem'

// The sources of an answer, folded at its end: a plain label that opens the list under it as thin lines. The label can be changed, to
// make a sentence of the answer's own the way in.
export function SourcesDisclosure({ items, sessionId, label = 'Sources' }: { items: SourceItem[]; sessionId?: string; label?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  if (items.length === 0) return null

  return (
    <div ref={root} className="w-full max-w-[560px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value)
          // Once the list has unfolded, bring its end into view above the composer.
          if (!open) setTimeout(() => root.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 320)
        }}
        className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        <span>{label}</span>
        <Down size={11} className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2" inert={!open}>
            {items.map((item) => (
              <SourceRow key={item.key} item={item} sessionId={sessionId} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
