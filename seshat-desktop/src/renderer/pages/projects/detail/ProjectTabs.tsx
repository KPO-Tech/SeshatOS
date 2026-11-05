import { TabBar, type TabItem } from '@renderer/components/ui/TabBar'
import { FileText, Folder, Notes, Time } from '../icons'
import { useTranslation } from 'react-i18next'

export type Tab = 'overview' | 'files' | 'sessions' | 'notes'

/** The tabs of a project page: Overview, Files, Sessions (with how many), Notes. */
export function ProjectTabs({ tab, sessionCount, onSelect }: { tab: Tab; sessionCount: number; onSelect: (tab: Tab) => void }) {
  const { t } = useTranslation('shell')
  const tabs: TabItem<Tab>[] = [
    { id: 'overview', label: t('pages.projects.detail.tabOverview'), icon: <Folder size={14} /> },
    { id: 'files', label: t('pages.projects.detail.tabFiles'), icon: <FileText size={14} /> },
    { id: 'sessions', label: t('pages.projects.detail.tabSessions'), icon: <Time size={14} />, count: sessionCount },
    // Greyed until the notes are thought over again: the page is kept, its tab cannot be opened.
    { id: 'notes', label: t('pages.projects.detail.tabNotes'), icon: <Notes size={14} />, disabled: true, title: t('pages.projects.detail.index.comingBackSoon') }
  ]
  return <TabBar tabs={tabs} value={tab} onChange={onSelect} ariaLabel={t('pages.projects.detail.index.project')} className="mt-3" />
}
