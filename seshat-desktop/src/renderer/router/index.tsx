import { createHashRouter, Navigate, useParams } from 'react-router'
import { Shell } from '@renderer/components/layout/Shell'
import { PluginsPage } from '@renderer/components/plugins/PluginsPage'
import { SkillsPage } from '@renderer/components/skills/SkillsPage'
import { ConversationPage } from '@renderer/components/chat/conversation/ConversationPage'
import { Home } from '@renderer/pages/Home'
import { ProjectsPage } from '@renderer/pages/projects'
import { ProjectDetailPage } from '@renderer/pages/projects/detail'
import { AdminPage } from '@renderer/pages/admin'
import { StorePage } from '@renderer/pages/store'

// React Router reuses a route's element across navigations to the same
// route pattern - switching from /conversation/A to /conversation/B keeps
// the same ConversationPage instance mounted, with every bit of its local
// state (draft text, attachments, selected model/provider, selected
// Knowledge corpus) carrying over from A into B. Keying on the id param
// forces a real unmount/remount on every conversation switch instead.
function ConversationRoute() {
  const { id } = useParams()
  return <ConversationPage key={id} />
}

// Authentication is handled in App.tsx (this router only mounts once signed
// in), so every route below lives inside the shell.
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'conversation/:id', element: <ConversationRoute /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'plugins', element: <PluginsPage /> },
      { path: 'store', element: <StorePage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectDetailPage /> },
      { path: 'admin/*', element: <AdminPage /> }
    ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
])
