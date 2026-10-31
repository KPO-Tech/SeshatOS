import { useEffect, useState } from 'react'
import { Close, SettingTwo } from '@icon-park/react'
import { edition } from '@renderer/lib/edition'
import { useOverlayStore } from '@renderer/stores/overlay'
import { findSection, groupSections, visibleSections, type SettingsSectionId } from './sections'
import { SettingsSectionView } from './SettingsSectionView'

type Props = {
  initialSection: SettingsSectionId
  onClose: () => void
}

/** Settings: one raised window with every page listed on its left, whatever used to be in Settings and in Config. */
export function SettingsModal({ initialSection, onClose }: Props) {
  const [active, setActive] = useState<SettingsSectionId>(findSection(initialSection, edition).id)
  const def = findSection(active, edition)
  const Icon = def.icon
  const groups = groupSections(visibleSections(edition))

  // A window over the app freezes the browser view that sits behind it.
  useEffect(() => {
    useOverlayStore.getState().setModalOpen(true)
    return () => useOverlayStore.getState().setModalOpen(false)
  }, [])

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-8 py-8 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Settings" className="relative flex h-full max-h-[820px] w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-root)] shadow-[0_26px_90px_rgba(0,0,0,0.45)]">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-soft)] pl-4 pr-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
              <SettingTwo theme="filled" size={14} fill="currentColor" />
            </span>
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">Settings</span>
            <span className="truncate text-[11.5px] text-[var(--text-muted)]">{edition.accounts ? 'This account' : 'This device'}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" className="flex size-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            <Close theme="outline" size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="no-scrollbar flex w-[236px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border-soft)] bg-[var(--surface-sidebar)] px-2.5 pb-3 pt-3.5">
            <nav className="grid gap-3.5" aria-label="Settings pages">
              {groups.map(([group, items]) => (
                <div key={group}>
                  <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{group}</div>
                  <div className="grid gap-px">
                    {items.map((section) => {
                      const SectionIcon = section.icon
                      const selected = section.id === active
                      return (
                        <button
                          key={section.id}
                          type="button"
                          aria-current={selected ? 'page' : undefined}
                          onClick={() => setActive(section.id)}
                          className={`flex h-8 cursor-pointer items-center gap-2.5 rounded-lg border-0 px-2.5 text-left text-[13px] font-medium ${selected ? 'bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'}`}
                        >
                          <SectionIcon theme="outline" size={16} />
                          <span className="truncate">{section.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

          <section className="no-scrollbar @container min-w-0 flex-1 overflow-y-auto px-8 pb-10 pt-6">
            <div className="mx-auto w-full max-w-[1000px]">
              <header className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
                  <Icon theme="filled" size={24} fill="currentColor" />
                </span>
                <div className="min-w-0">
                  <h1 className="m-0 text-[22px] font-semibold leading-tight text-[var(--text-primary)]">{def.label}</h1>
                  <p className="m-0 mt-1 text-[13px] leading-5 text-[var(--text-muted)]">{def.description}</p>
                </div>
              </header>
              <div className="mt-5 border-t border-[var(--border-soft)] pt-5">
                <SettingsSectionView id={def.id} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
