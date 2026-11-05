import type { ReactNode } from 'react'
import { ChartHistogram, MailOpen, Peoples, Robot } from '@icon-park/react'
import { edition } from '@renderer/lib/edition'

// Every platform SeshatOS can host, ready or not yet built: the one list that
// says what exists and what is still ahead. Skills and Plugins are not here:
// they are tools of the chat, not platforms, and live in the sidebar.
export type StoreApp = {
  id: string
  name: string
  tagline: string
  description: string
  // The product icon (a file under public/brand, relative so it loads over file://) or, until one exists, a glyph.
  logo?: string
  icon?: ReactNode
  // Where the app opens once it is ready. An app without a route is shown as coming soon.
  route?: string
  // The app works on an organization's data and needs a SeshatCloud connection.
  needsCloud?: boolean
  featured?: boolean
}

export const STORE_APPS: StoreApp[] = [
  {
    id: 'knowledge',
    name: 'Knowledge',
    tagline: 'store:pages.store.apps.knowledge.tagline',
    description: 'store:pages.store.apps.knowledge.description',
    logo: 'brand/knowledge-icon.svg',
    route: edition.knowledgeApp ? '/knowledge' : undefined,
    needsCloud: true,
    featured: true
  },
  {
    id: 'automation',
    name: 'Automation',
    tagline: 'store:pages.store.apps.automation.tagline',
    description: 'store:pages.store.apps.automation.description',
    logo: 'brand/automation-icon.svg',
    needsCloud: true
  },
  { id: 'data', name: 'Data', tagline: 'store:pages.store.apps.data.tagline', description: 'store:pages.store.apps.data.description', icon: <ChartHistogram size={20} /> },
  { id: 'inbox', name: 'Inbox', tagline: 'store:pages.store.apps.inbox.tagline', description: 'store:pages.store.apps.inbox.description', icon: <MailOpen size={20} /> },
  { id: 'companion', name: 'Companion', tagline: 'store:pages.store.apps.companion.tagline', description: 'store:pages.store.apps.companion.description', icon: <Robot size={20} /> },
  { id: 'team', name: 'Team', tagline: 'store:pages.store.apps.team.tagline', description: 'store:pages.store.apps.team.description', icon: <Peoples size={20} /> }
]
