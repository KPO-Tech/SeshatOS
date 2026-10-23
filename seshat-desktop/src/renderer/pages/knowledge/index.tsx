import { Navigate, Route, Routes } from 'react-router'
import { hasAdminAccess } from '@renderer/lib/authz'
import { useAuthStore } from '@renderer/stores/auth'
import { AskPage } from './ask/AskPage'
import { CollectionPage } from './collections/CollectionPage'
import { CollectionsPage } from './collections/CollectionsPage'
import { ComingNext } from './components/ComingNext'
import { SearchPage } from './search/SearchPage'
import './knowledge.css'

// The Knowledge platform, opened from the Store. Its navigation lives in the sidebar (see components/KnowledgeNav.tsx), so this is
// only the page.
export function KnowledgePage() {
  const isAdmin = hasAdminAccess(useAuthStore((state) => state.roles))

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <Routes>
        <Route index element={<AskPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collections/:id" element={<CollectionPage />} />
        <Route path="sources" element={isAdmin ? <ComingNext tab="sources" /> : <Navigate to="/knowledge" replace />} />
        <Route path="settings" element={isAdmin ? <ComingNext tab="settings" /> : <Navigate to="/knowledge" replace />} />
        <Route path="*" element={<Navigate to="/knowledge" replace />} />
      </Routes>
    </main>
  )
}
