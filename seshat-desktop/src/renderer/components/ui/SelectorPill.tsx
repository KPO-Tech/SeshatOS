import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Down, CheckCorrect } from '@icon-park/react'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// min-w is a snug default sized for short, label-only options (e.g. the
// permission mode menu's "Smart"/"Auto") - callers with longer labels or
// descriptions (e.g. ChatInput's model menu) widen it via their own
// className, since Tailwind can't shrink-to-fit content in a dropdown that
// also needs a floor width.
const SELECTOR_MENU_CLASS =
  'absolute left-0 top-[calc(100%+6px)] z-30 flex max-h-[min(252px,calc(100vh-190px))] min-w-[140px] max-w-[min(320px,calc(100vw-32px))] flex-col gap-0 overflow-hidden rounded-app-md border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_96%,var(--surface-root))] p-1 shadow-[0_18px_48px_rgba(31,27,23,0.17)]'

const SELECTOR_LIST_CLASS =
  'min-h-0 flex-1 overflow-y-auto [scrollbar-color:color-mix(in_srgb,var(--text-muted)_28%,transparent)_transparent] [scrollbar-width:thin]'

const SELECTOR_MENU_ITEM_CLASS =
  'flex min-h-[30px] w-full min-w-0 cursor-pointer items-center justify-between gap-[7px] rounded-none border border-transparent bg-transparent px-[7px] py-1.5 text-left text-[var(--font-size-sm)] text-app-text hover:border-app-border-subtle hover:bg-[color-mix(in_srgb,var(--surface-muted)_48%,var(--surface-panel))] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent'

const SELECTOR_MENU_COPY_CLASS = 'min-w-0 flex-1 [&>span:first-child]:truncate'

// A provider can offer hundreds of models: past this many options the list is windowed, each option being one fixed-height row.
const VIRTUALIZE_ABOVE = 60
const OPTION_ROW_HEIGHT = 32
// The search box only appears on lists long enough to need it.
const SEARCH_ABOVE = 12

type Props = {
  label: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  // True while this pill's own dropdown is open - keeps it visually engaged
  // even when the mouse isn't hovering it anymore (e.g. moved down into the
  // menu). Bare (no border/fill) at rest otherwise, so it reads as light as
  // the icon-only buttons next to it (attach, project, knowledge base).
  active?: boolean
  className?: string
}

export function SelectorPill({ label, icon, onClick, disabled = false, active = false, className }: Props) {
  return (
    <button
      className={cx(
        'flex max-w-[220px] cursor-pointer items-center gap-3 whitespace-nowrap rounded-app-md border px-4 py-2 transition-all duration-150 disabled:cursor-default disabled:opacity-70 disabled:hover:border-transparent disabled:hover:bg-transparent',
        active
          ? 'border-app-border bg-[var(--surface-hover)]'
          : 'border-transparent bg-transparent hover:border-app-border-subtle hover:bg-app-surface',
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      {icon && <span className="flex items-center text-app-text-secondary">{icon}</span>}
      <span className="truncate text-[var(--font-size-xs)] font-medium text-app-text">{label}</span>
      <Down size={10} />
    </button>
  )
}

export type SelectorOption = {
  id: string
  label: string
  disabled?: boolean
  description?: string
  icon?: ReactNode
  prefix?: string
}

type SelectorMenuProps = {
  options: SelectorOption[]
  selectedId?: string | null
  onSelect: (id: string) => void
  align?: 'left' | 'right'
  // 'up' is for triggers near the bottom of the screen, e.g. ChatInput.
  placement?: 'down' | 'up'
  className?: string
  // Adds a search box to a long list (matches the label and the description).
  searchable?: boolean
}

export function filterSelectorOptions(options: SelectorOption[], query: string): SelectorOption[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return options
  return options.filter((option) => option.label.toLowerCase().includes(needle) || option.description?.toLowerCase().includes(needle))
}

export function SelectorMenu({
  options,
  selectedId,
  onSelect,
  align = 'left',
  placement = 'down',
  className,
  searchable = false,
}: SelectorMenuProps) {
  const [query, setQuery] = useState('')
  const showSearch = searchable && options.length > SEARCH_ABOVE
  const visible = useMemo(() => (showSearch ? filterSelectorOptions(options, query) : options), [options, query, showSearch])
  const virtualized = visible.length > VIRTUALIZE_ABOVE

  return (
    <div
      className={cx(
        SELECTOR_MENU_CLASS,
        align === 'right' && 'left-auto right-0',
        placement === 'up' && 'bottom-[calc(100%+6px)] top-auto',
        className,
      )}
    >
      {showSearch && (
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search"
          className="mb-1 h-7 w-full shrink-0 rounded-none border border-app-border-subtle bg-transparent px-[7px] text-[var(--font-size-sm)] text-app-text outline-none"
        />
      )}
      {visible.length === 0 ? (
        <div className="px-[7px] py-2 text-[var(--font-size-xs)] text-app-text-muted">No match.</div>
      ) : virtualized ? (
        <VirtualOptionList options={visible} selectedId={selectedId} onSelect={onSelect} />
      ) : (
        <div className={SELECTOR_LIST_CLASS}>
          {visible.map((option) => (
            <OptionButton key={option.id} option={option} selected={option.id === selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

function VirtualOptionList({ options, selectedId, onSelect }: { options: SelectorOption[]; selectedId?: string | null; onSelect: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: options.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => OPTION_ROW_HEIGHT,
    overscan: 8,
  })

  return (
    <div ref={scrollRef} className={SELECTOR_LIST_CLASS}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const option = options[row.index]
          return (
            <div
              key={option.id}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: OPTION_ROW_HEIGHT, transform: `translateY(${row.start}px)` }}
            >
              <OptionButton option={option} selected={option.id === selectedId} onSelect={onSelect} fixedHeight />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OptionButton({ option, selected, onSelect, fixedHeight = false }: { option: SelectorOption; selected: boolean; onSelect: (id: string) => void; fixedHeight?: boolean }) {
  return (
    <button
      className={cx(
        SELECTOR_MENU_ITEM_CLASS,
        fixedHeight && 'h-full',
        selected &&
          'border-[color-mix(in_srgb,var(--accent-primary)_22%,var(--border-soft))] bg-[color-mix(in_srgb,var(--accent-primary)_11%,var(--surface-panel))] text-app-primary',
      )}
      disabled={option.disabled}
      onClick={() => !option.disabled && onSelect(option.id)}
      type="button"
    >
      <span
        className={cx(
          'flex size-[13px] shrink-0 items-center justify-center rounded-[3px] border',
          selected
            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
            : 'border-app-border-subtle bg-transparent',
        )}
        aria-hidden="true"
      >
        {selected && <CheckCorrect size={8} />}
      </span>
      {option.icon ? (
        <span className="inline-flex size-[17px] shrink-0 items-center justify-center rounded-none [&_svg]:block [&_svg]:size-[17px]" aria-hidden="true">
          {option.icon}
        </span>
      ) : option.prefix && (
        <span className="inline-flex size-[17px] shrink-0 items-center justify-center rounded-none border border-[color-mix(in_srgb,var(--accent-primary)_20%,var(--border-soft))] bg-[color-mix(in_srgb,var(--accent-primary)_13%,var(--surface-panel))] text-[8px] font-extrabold uppercase text-app-primary" aria-hidden="true">
          {option.prefix}
        </span>
      )}
      <span className={SELECTOR_MENU_COPY_CLASS}>
        <span>{option.label}</span>
      </span>
      {option.description && (
        <span className="max-w-[92px] shrink-0 truncate text-right text-[var(--font-size-2xs)] font-medium leading-none text-app-text-muted">
          {option.description}
        </span>
      )}
    </button>
  )
}
