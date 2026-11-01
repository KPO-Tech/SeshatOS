import { useState } from 'react'
import { SettingsCard } from '../../settings/kit'
import type { DomainCategory } from './webSearchTypes'

type DomainCatalogProps = {
  categories: DomainCategory[]
  activeDomains: Set<string>
  orgBlockedCount: number
  onToggle: (domain: string) => void
  onToggleCategory: (domains: string[]) => void
}

/** The domains an agent may use while searching, in groups that open on demand. */
export function DomainCatalog({ categories, activeDomains, orgBlockedCount, onToggle, onToggleCategory }: DomainCatalogProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  function toggleOpen(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <SettingsCard title="Allowed domains" badge={orgBlockedCount > 0 ? <span className="text-[11px] font-semibold text-[var(--accent-primary)]">{orgBlockedCount} blocked by your organization</span> : undefined}>
      {categories.map((category) => {
        const open = openIds.has(category.id)
        const activeCount = category.domains.filter((domain) => activeDomains.has(domain)).length
        const all = activeCount === category.domains.length
        return (
          <div key={category.id}>
            <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
              <button
                type="button"
                onClick={() => onToggleCategory(category.domains)}
                className={`flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors ${all ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]' : activeCount > 0 ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/25' : 'border-[var(--border-strong)] bg-transparent'}`}
                aria-label={`Toggle all ${category.label} domains`}
              >
                {activeCount > 0 && <span className="size-1.5 rounded-full bg-white" />}
              </button>
              <button type="button" onClick={() => toggleOpen(category.id)} className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-4 border-0 bg-transparent p-0 text-left" aria-expanded={open}>
                <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{category.label}</span>
                <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
                  {activeCount} / {category.domains.length}
                </span>
              </button>
            </div>
            {open && (
              <div className="grid grid-cols-3 gap-2 bg-[var(--surface-root)]/40 p-3">
                {category.domains.map((domain) => {
                  const active = activeDomains.has(domain)
                  return (
                    <button
                      key={domain}
                      type="button"
                      onClick={() => onToggle(domain)}
                      className={`flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-2.5 py-2 text-left text-[12px] font-medium ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Favicon domain={domain} />
                        <span className="truncate">{domain}</span>
                      </span>
                      <span className={`size-2 shrink-0 rounded-full ${active ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-strong)]'}`} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </SettingsCard>
  )
}

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--surface-muted)] text-[10px] font-bold text-[var(--text-muted)]">{domain[0]?.toUpperCase()}</span>
  }
  return <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`} alt="" className="size-5 shrink-0 rounded" loading="lazy" onError={() => setFailed(true)} />
}
