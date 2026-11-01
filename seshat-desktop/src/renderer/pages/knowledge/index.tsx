import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router'
import { AskPage } from './ask/AskPage'
import { CollectionPage } from './collections/CollectionPage'
import { CollectionsPage } from './collections/CollectionsPage'
import { sourcePath } from './collections/sourcesApi'
import { SearchPage } from './search/SearchPage'
import { SourcesPage } from './sources/SourcesPage'
import { useCanManageKnowledge } from './useCanManage'
import './knowledge.css'

// The page of a source is the list of collections filtered by it: the old address still leads there.
function SourceRedirect() {
  const { sourceId = '' } = useParams()
  return <Navigate to={sourcePath(sourceId)} replace />
}

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
        <Route path="collections/source/:sourceId" element={<SourceRedirect />} />
        <Route path="collections/:id" element={<CollectionPage />} />
        <Route path="sources" element={manage(<SourcesPage />)} />
        <Route path="*" element={<Navigate to="/knowledge" replace />} />
      </Routes>
    </main>
  )
}
