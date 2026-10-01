import { useState } from 'react'
import type { DomainCategory } from './webSearchTypes'

type DomainCatalogProps = {
  categories: DomainCategory[]
  activeDomains: Set<string>
  saving: boolean
  saved: boolean
  orgBlockedCount: number
  onToggle: (domain: string) => void
  onToggleCategory: (domains: string[]) => void
  onSave: () => Promise<void>
}

export function DomainCatalog({ categories, activeDomains, saving, saved, orgBlockedCount, onToggle, onToggleCategory, onSave }: DomainCatalogProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(categories[0]?.id ? [categories[0].id] : []))

  function toggleCategory(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-soft)] px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Domain catalog</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Choose the domains SeshatOS can use while searching.</p>
          {orgBlockedCount > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-[var(--accent-warning)]">{orgBlockedCount} organization blocked domains apply.</p>
          )}
        </div>
        <button type="button" onClick={() => void onSave()} disabled={saving} className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-45">
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save domains'}
        </button>
      </div>

      <div className="divide-y divide-[var(--border-soft)]">
        {categories.map((category) => {
          const open = openIds.has(category.id)
          const activeCount = category.domains.filter((domain) => activeDomains.has(domain)).length
          return (
            <div key={category.id}>
              <div className="flex w-full items-center gap-2.5 px-4 py-3 hover:bg-[var(--surface-muted)]">
                <button
                  type="button"
                  onClick={() => onToggleCategory(category.domains)}
                  className={[
                    'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                    activeCount === category.domains.length
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]'
                      : activeCount > 0
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/25'
                        : 'border-[var(--border-strong)] bg-transparent'
                  ].join(' ')}
                  aria-label={`Toggle all ${category.label} domains`}
                >
                  {activeCount > 0 && <span className="size-1.5 rounded-full bg-white" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                  aria-expanded={open}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronIcon open={open} />
                    <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{category.label}</span>
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-[var(--text-muted)]">{activeCount} / {category.domains.length} active</span>
                </button>
              </div>
              {open && (
                <div className="grid grid-cols-3 gap-2 border-t border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
                  {category.domains.map((domain) => {
                    const active = activeDomains.has(domain)
                    return (
                      <button
                        key={domain}
                        type="button"
                        onClick={() => onToggle(domain)}
                        className={[
                          'flex min-w-0 items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-[12px] font-semibold',
                          active
                            ? 'border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-primary)]'
                            : 'border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-muted)]'
                        ].join(' ')}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Favicon domain={domain} />
                          <span className="truncate">{domain}</span>
                        </span>
                        <span className={['size-2 shrink-0 rounded-full', active ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-strong)]'].join(' ')} />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--text-muted)]" aria-hidden="true">
      {open ? <path d="m3.5 5 3 3 3-3" /> : <path d="m5 3.5 3 3-3 3" />}
    </svg>
  )
}

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--surface-muted)] text-[10px] font-bold text-[var(--text-muted)]">
        {domain[0]?.toUpperCase()}
      </span>
    )
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
      alt=""
      className="size-5 shrink-0 rounded"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
