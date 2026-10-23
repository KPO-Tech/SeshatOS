import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { hasAdminAccess } from '@renderer/lib/authz'
import { useAuthStore } from '@renderer/stores/auth'
import { AskPage } from './ask/AskPage'
import { ComingNext } from './components/ComingNext'
import { KnowledgeNav } from './components/KnowledgeNav'
import { tabFromPath, type KnowledgeTab } from './nav'
import './knowledge.css'

// The Knowledge platform, opened from the Store: its own navigation on the left, one page on the right.
export function KnowledgePage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isAdmin = hasAdminAccess(useAuthStore((state) => state.roles))

  function select(tab: KnowledgeTab) {
    navigate(tab === 'ask' ? '/knowledge' : `/knowledge/${tab}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <KnowledgeNav active={tabFromPath(pathname)} isAdmin={isAdmin} onSelect={select} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Routes>
          <Route index element={<AskPage />} />
          <Route path="search" element={<ComingNext tab="search" />} />
          <Route path="collections" element={<ComingNext tab="collections" />} />
          <Route path="sources" element={isAdmin ? <ComingNext tab="sources" /> : <Navigate to="/knowledge" replace />} />
          <Route path="settings" element={isAdmin ? <ComingNext tab="settings" /> : <Navigate to="/knowledge" replace />} />
          <Route path="*" element={<Navigate to="/knowledge" replace />} />
        </Routes>
      </main>
    </div>
  )
}
