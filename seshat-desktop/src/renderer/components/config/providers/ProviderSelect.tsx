import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { ProviderCatalogEntry } from './providerTypes'
import { authTypeLabel } from './providerUtils'

type ProviderSelectProps = {
  catalog: ProviderCatalogEntry[]
  value: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (provider: string) => void
}

export function ProviderSelect({ catalog, value, open, onOpenChange, onChange }: ProviderSelectProps) {
  const selected = catalog.find((entry) => entry.name === value)

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
          <ProviderIcon provider={selected?.name || 'provider'} size={26} className="shrink-0" />
          <span className="truncate">{selected?.display_name || 'Select provider'}</span>
        </span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[66px] z-30 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
          <div className="no-scrollbar max-h-[278px] overflow-y-auto p-1.5" role="listbox">
            {catalog.map((entry) => (
              <button
                key={entry.name}
                type="button"
                onClick={() => onChange(entry.name)}
                className={[
                  'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors',
                  entry.name === value
                    ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                ].join(' ')}
                role="option"
                aria-selected={entry.name === value}
              >
                <ProviderIcon provider={entry.name} size={28} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{entry.display_name}</span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">{authTypeLabel(entry.auth_type)}</span>
                </span>
                {entry.name === value && <CheckIcon />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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
