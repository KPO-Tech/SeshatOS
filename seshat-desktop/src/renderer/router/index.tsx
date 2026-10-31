import { createHashRouter, Navigate, useParams } from 'react-router'
import { Shell } from '@renderer/components/layout/Shell'
import { ConversationPage } from '@renderer/components/chat/conversation/ConversationPage'
import { Home } from '@renderer/pages/Home'
import { edition } from '@renderer/lib/edition'

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

// Only the home and the conversation open at start. The other pages load when they are first visited: in dev every imported module is a
// request to the dev server (about 250 at start, on a machine with a slow disk many seconds), and a page the edition hides is never
// needed at all. The built app gets a small chunk per page instead of one large file.
const settingsPage = () => import('@renderer/components/settings/page/SettingsPage').then((m) => ({ Component: m.SettingsPage }))
const plugins = () => import('@renderer/components/plugins/PluginsPage').then((m) => ({ Component: m.PluginsPage }))
const skills = () => import('@renderer/components/skills/SkillsPage').then((m) => ({ Component: m.SkillsPage }))
const skillDetail = () => import('@renderer/components/skills/SkillDetailPage').then((m) => ({ Component: m.SkillDetailPage }))
const projects = () => import('@renderer/pages/projects').then((m) => ({ Component: m.ProjectsPage }))
const projectDetail = () => import('@renderer/pages/projects/detail').then((m) => ({ Component: m.ProjectDetailPage }))
const store = () => import('@renderer/pages/store').then((m) => ({ Component: m.StorePage }))
const knowledge = () => import('@renderer/pages/knowledge').then((m) => ({ Component: m.KnowledgePage }))
const admin = () => import('@renderer/pages/admin').then((m) => ({ Component: m.AdminPage }))

// Authentication is handled in App.tsx (this router only mounts once signed
// in), so every route below lives inside the shell.
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'conversation/:id', element: <ConversationRoute /> },
      { path: 'settings/:section?', lazy: settingsPage },
      { path: 'skills', lazy: skills },
      { path: 'skills/:name', lazy: skillDetail },
      { path: 'plugins', lazy: plugins },
      ...(edition.store ? [{ path: 'store', lazy: store }] : []),
      ...(edition.knowledgeApp ? [{ path: 'knowledge/*', lazy: knowledge }] : []),
      { path: 'projects', lazy: projects },
      { path: 'projects/:projectId', lazy: projectDetail },
      ...(edition.cloud ? [{ path: 'admin/*', lazy: admin }] : [])
    ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
])
