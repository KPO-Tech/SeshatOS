import { useEffect, useRef, type FormEvent } from 'react'
import { Search } from '@icon-park/react'
import { ScopeSelect } from '../components/ScopeSelect'
import type { AskScope, KnowledgeCollection } from '../chat/useCollections'

type Props = {
  value: string
  collections: KnowledgeCollection[]
  scope: AskScope
  busy: boolean
  autoFocus?: boolean
  onChange: (value: string) => void
  onScopeChange: (scope: AskScope) => void
  onSubmit: () => void
}

// The search field: the card of the input of Ask, with a magnifier, and the choice of collection below.
export function SearchField({ value, collections, scope, busy, autoFocus, onChange, onScopeChange, onSubmit }: Props) {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) field.current?.focus()
  }, [autoFocus])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (value.trim() && !busy) onSubmit()
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className="relative rounded-[18px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] px-3.5 pb-2.5 pt-3 shadow-[0_14px_34px_rgba(31,27,23,0.09)] transition-[border-color,box-shadow] duration-[180ms] ease-in-out focus-within:border-[color-mix(in_srgb,var(--accent-primary)_42%,var(--border-soft))] focus-within:shadow-[0_18px_42px_rgba(31,27,23,0.12),0_0_0_2px_color-mix(in_srgb,var(--accent-primary)_14%,transparent)]"
    >
      <div className="flex items-center gap-2.5">
        <Search size={16} className="shrink-0 text-app-text-muted" />
        <input
          ref={field}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search your documents by keyword"
          aria-label="Search"
          className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-[14px] text-app-text outline-none [font-family:inherit] placeholder:text-app-text-muted"
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2.5">
        <ScopeSelect collections={collections} scope={scope} onChange={onScopeChange} />
        <button
          type="submit"
          disabled={!value.trim() || busy}
          className="flex h-[30px] shrink-0 cursor-pointer items-center rounded-[9px] border-0 bg-[var(--accent-primary)] px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-[color-mix(in_srgb,var(--surface-panel)_82%,var(--surface-root))] disabled:text-app-text-muted"
        >
          Search
        </button>
      </div>
    </form>
  )
}
