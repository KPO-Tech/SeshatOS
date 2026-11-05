import { FileText, Folder, Notes, Time } from '../icons'
import { useTranslation } from 'react-i18next'

export type Tab = 'overview' | 'files' | 'sessions' | 'notes'

// The labels are keys of the catalogue: the tab bar draws them through t().
const TABS: ReadonlyArray<{ id: Tab; label: string; icon: typeof FileText; soon?: boolean }> = [
  { id: 'overview', label: 'shell:pages.projects.detail.tabOverview', icon: Folder },
  { id: 'files', label: 'shell:pages.projects.detail.tabFiles', icon: FileText },
  { id: 'sessions', label: 'shell:pages.projects.detail.tabSessions', icon: Time },
  // Greyed until the notes are thought over again: the page is kept, its tab cannot be opened.
  { id: 'notes', label: 'shell:pages.projects.detail.tabNotes', icon: Notes, soon: true }
]

/** The tabs of a project page: Overview, Files, Sessions (with how many), Notes. */
export function ProjectTabs({ tab, sessionCount, onSelect }: { tab: Tab; sessionCount: number; onSelect: (tab: Tab) => void }) {
  const { t } = useTranslation('shell')
  return (
    <nav className="mt-3 flex shrink-0 gap-1 border-b border-[var(--border-soft)] px-6" role="tablist" aria-label={t('pages.projects.detail.index.project')}>
      {TABS.map((item) => {
        const Icon = item.icon
        const selected = tab === item.id
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={item.soon}
            title={item.soon ? t('pages.projects.detail.index.comingBackSoon') : undefined}
            onClick={() => onSelect(item.id)}
            className={`-mb-px flex items-center gap-1.5 border-0 border-b-2 bg-transparent px-3 py-2 text-[13px] font-medium ${item.soon ? 'cursor-not-allowed border-transparent text-[var(--text-muted)] opacity-40' : selected ? 'cursor-pointer border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'cursor-pointer border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            <Icon size={14} />
            {t(item.label)}
            {item.id === 'sessions' && sessionCount > 0 && <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10.5px] leading-none text-[var(--text-muted)]">{sessionCount}</span>}
          </button>
        )
      })}
    </nav>
  )
}
