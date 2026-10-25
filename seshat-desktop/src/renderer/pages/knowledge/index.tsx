import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AskPage } from './ask/AskPage'
import { CollectionPage } from './collections/CollectionPage'
import { CollectionsPage } from './collections/CollectionsPage'
import { SearchPage } from './search/SearchPage'
import { SettingsPage } from './settings/SettingsPage'
import { SourcesPage } from './sources/SourcesPage'
import { useCanManageKnowledge } from './useCanManage'
import './knowledge.css'

// The Knowledge platform, opened from the Store. Its navigation lives in the sidebar (see components/KnowledgeNav.tsx), so this is
// only the page.
export function KnowledgePage() {
  // Sources and Settings manage Knowledge: open on a device of one's own, for administrators when paired with an organization. Until the
  // mode is known, they wait instead of sending a link to them back to the start page.
  const { allowed, known } = useCanManageKnowledge()
  const manage = (page: ReactNode) => (allowed ? page : known ? <Navigate to="/knowledge" replace /> : null)

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <Routes>
        <Route index element={<AskPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collections/:id" element={<CollectionPage />} />
        <Route path="sources" element={manage(<SourcesPage />)} />
        <Route path="settings" element={manage(<SettingsPage />)} />
        <Route path="*" element={<Navigate to="/knowledge" replace />} />
      </Routes>
    </main>
  )
}
