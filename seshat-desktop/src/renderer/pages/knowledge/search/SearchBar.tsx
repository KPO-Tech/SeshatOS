import { useEffect, useRef, type FormEvent } from 'react'
import { CloseSmall, Search } from '@icon-park/react'

type Props = {
  value: string
  busy: boolean
  autoFocus?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

// The search bar of the page: a magnifier, the query, a button to clear it, and the button that searches. Ctrl+K from anywhere in the
// page puts the cursor in it.
export function SearchBar({ value, busy, autoFocus, onChange, onSubmit }: Props) {
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) field.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        field.current?.focus()
        field.current?.select()
      }
    }
    window.addEventListener('keydown', focus)
    return () => window.removeEventListener('keydown', focus)
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (value.trim() && !busy) onSubmit()
  }

  return (
    <form
      onSubmit={submit}
      role="search"
      className="flex h-11 w-full items-center gap-2.5 rounded-[14px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] pl-3.5 pr-1.5 transition-[border-color,box-shadow] duration-[160ms] focus-within:border-[color-mix(in_srgb,var(--accent-primary)_55%,var(--border-soft))] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_16%,transparent)]"
    >
      <Search size={17} className="shrink-0 text-app-text-muted" />
      <input
        ref={field}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search your documents: a question, a topic, a number or a code"
        aria-label="Search"
        className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[14.5px] text-app-text outline-none [font-family:inherit] placeholder:text-app-text-muted"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            field.current?.focus()
          }}
          aria-label="Clear the search"
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text"
        >
          <CloseSmall size={16} />
        </button>
      )}
      {!value && <kbd className="hidden shrink-0 rounded-[7px] border border-app-border-subtle px-2 py-0.5 text-[11px] text-app-text-muted sm:block">Ctrl K</kbd>}
      <button
        type="submit"
        disabled={!value.trim() || busy}
        aria-label="Search"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-[var(--accent-primary)] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-[color-mix(in_srgb,var(--surface-panel)_82%,var(--surface-root))] disabled:text-app-text-muted"
      >
        <Search size={15} />
      </button>
    </form>
  )
}
