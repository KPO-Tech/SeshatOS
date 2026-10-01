import { createHashRouter, Navigate } from 'react-router'
import { Shell } from '@renderer/components/layout/Shell'
import { PluginsPage } from '@renderer/components/plugins/PluginsPage'
import { SchedulingPage } from '@renderer/components/scheduling/SchedulingPage'
import { SkillsPage } from '@renderer/components/skills/SkillsPage'
import { ConversationPage } from '@renderer/components/chat/conversation/ConversationPage'
import { Home } from '@renderer/pages/Home'
import { ProjectsPage } from '@renderer/pages/projects'
import { ProjectDetailPage } from '@renderer/pages/projects/detail'
import { AdminPage } from '@renderer/pages/admin'
import { StorePage } from '@renderer/pages/store'

// Authentication is handled in App.tsx (this router only mounts once signed
// in), so every route below lives inside the shell.
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'conversation/:id', element: <ConversationPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'plugins', element: <PluginsPage /> },
      { path: 'scheduling', element: <SchedulingPage /> },
      { path: 'store', element: <StorePage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectDetailPage /> },
      { path: 'admin/*', element: <AdminPage /> }
    ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
])
