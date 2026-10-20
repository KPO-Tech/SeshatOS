import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { ProviderChoice } from './providerTypes'
import { authTypeLabel, providerMenuItems } from './providerUtils'

type ProviderSelectProps = {
  choices: ProviderChoice[]
  value: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (provider: string) => void
}

const ROW_HEIGHT = 44
const MAX_LIST_HEIGHT = 278

export function ProviderSelect({ choices, value, open, onOpenChange, onChange }: ProviderSelectProps) {
  const selected = choices.find((entry) => entry.id === value)
  const [query, setQuery] = useState('')
  const [moreExpanded, setMoreExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const items = useMemo(() => providerMenuItems(choices, query, moreExpanded), [choices, query, moreExpanded])
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6
  })

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <div className="relative grid gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">Provider</span>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2.5 text-left text-[13px] font-semibold text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <ProviderIcon provider={selected?.id || 'provider'} size={26} className="shrink-0" />
          <span className="truncate">{selected?.name || 'Select provider'}</span>
        </span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[66px] z-30 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
          <div className="border-b border-[var(--border-soft)] p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search providers"
              aria-label="Search providers"
              className="h-8 w-full rounded-md bg-[var(--surface-muted)] px-2.5 text-[13px] text-[var(--text-primary)] outline-none"
            />
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-[var(--text-muted)]">No provider matches this search.</div>
          ) : (
            <div
              ref={scrollRef}
              className="no-scrollbar overflow-y-auto p-1.5"
              style={{ maxHeight: MAX_LIST_HEIGHT, height: Math.min(items.length * ROW_HEIGHT + 12, MAX_LIST_HEIGHT) }}
              role="listbox"
            >
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const item = items[virtualRow.index]
                  return (
                    <div
                      key={item.kind === 'more' ? 'more' : item.choice.id}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: ROW_HEIGHT, transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {item.kind === 'more' ? (
                        <button
                          type="button"
                          onClick={() => setMoreExpanded((current) => !current)}
                          className="flex h-full w-full items-center justify-between gap-2.5 rounded-md px-2.5 text-left text-[12px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                          aria-expanded={item.expanded}
                        >
                          <span>More providers ({item.count})</span>
                          <span className={item.expanded ? 'rotate-180' : ''}><ChevronDownIcon /></span>
                        </button>
                      ) : (
                        <ChoiceOption choice={item.choice} selected={item.choice.id === value} onSelect={onChange} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChoiceOption({ choice, selected, onSelect }: { choice: ProviderChoice; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(choice.id)}
      className={[
        'flex h-full w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors',
        selected
          ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
      ].join(' ')}
      role="option"
      aria-selected={selected}
    >
      <ProviderIcon provider={choice.id} size={28} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{choice.name}</span>
        <span className="block truncate text-[11px] text-[var(--text-muted)]">
          {authTypeLabel(choice.auth_type)}
          {choice.main ? '' : ` - ${choice.model_count} models, not tested with a real key`}
        </span>
      </span>
      {selected && <CheckIcon />}
    </button>
  )
}

function CheckIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 8 3 3 7-7" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" />
    </svg>
  )
}
