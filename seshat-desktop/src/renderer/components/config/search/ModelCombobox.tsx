import { useEffect, useMemo, useRef, useState } from 'react'

// Free models of OpenRouter carry ":free" at the end of their id.
const isFree = (model: string) => model.endsWith(':free')

// The field of a model: type any id, or open the list of the models a provider offers. The list always shows all of them when it opens;
// it narrows only once something is typed, so the model already chosen does not hide the others.
export function ModelCombobox({ value, options, placeholder, onChange }: { value: string; options: string[]; placeholder?: string; onChange: (model: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)

  const shown = useMemo(() => {
    const needle = (query ?? '').trim().toLowerCase()
    const matching = needle ? options.filter((model) => model.toLowerCase().includes(needle)) : options
    // The free ones first, in the order the provider gives them.
    return [...matching.filter(isFree), ...matching.filter((model) => !isFree(model))]
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery(null)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => setHighlight(0), [query, open])

  function choose(model: string) {
    onChange(model)
    setOpen(false)
    setQuery(null)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false)
      setQuery(null)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlight((current) => Math.min(current + 1, shown.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && open && shown[highlight]) {
      event.preventDefault()
      choose(shown[highlight])
    }
  }

  const hasList = options.length > 0

  return (
    <div ref={root} className="relative min-w-0">
      <input
        value={query ?? value}
        placeholder={placeholder}
        onFocus={() => hasList && setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(hasList)
          onChange(event.target.value)
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        spellCheck={false}
        className={[
          'h-10 w-full min-w-0 rounded-md border bg-[var(--surface-muted)] pl-3 text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]',
          hasList ? 'pr-9' : 'pr-3',
          open ? 'border-[var(--accent-primary)]' : 'border-[var(--border-soft)]'
        ].join(' ')}
      />
      {hasList && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? 'Close the list of models' : 'Show the models'}
          onClick={() => setOpen((current) => !current)}
          className="absolute right-0 top-0 flex h-10 w-9 cursor-pointer items-center justify-center border-0 bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={open ? 'rotate-180 transition-transform' : 'transition-transform'}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}

      {open && hasList && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_18px_55px_rgba(0,0,0,0.45)]">
          <div className="border-b border-[var(--border-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
            {shown.length === options.length ? `${options.length} models` : `${shown.length} of ${options.length} models`}
          </div>
          <div className="no-scrollbar max-h-[260px] overflow-y-auto p-1.5" role="listbox">
            {shown.length === 0 && <div className="px-2.5 py-3 text-[12px] text-[var(--text-muted)]">No model of the list matches. The text is used as it is.</div>}
            {shown.map((model, index) => (
              <button
                key={model}
                type="button"
                role="option"
                aria-selected={model === value}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(model)}
                className={[
                  'flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-md border-0 px-2.5 text-left transition-colors',
                  index === highlight ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'bg-transparent text-[var(--text-secondary)]'
                ].join(' ')}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{model}</span>
                {isFree(model) && <span className="shrink-0 rounded-full bg-[var(--accent-success)]/12 px-2 py-0.5 text-[10.5px] font-semibold text-[var(--accent-success)]">Free</span>}
                {model === value && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
