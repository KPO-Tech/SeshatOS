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
    tagline: 'Search and ask across your organization’s documents.',
    description: 'Connect your sources, find a document by keyword, or ask a question and read the answer next to the passages it comes from.',
    logo: 'brand/knowledge-icon.svg',
    route: edition.knowledgeApp ? '/knowledge' : undefined,
    needsCloud: true,
    featured: true
  },
  {
    id: 'automation',
    name: 'Automation',
    tagline: 'Agent workflows that run on a schedule or a trigger.',
    description: 'Build governed workflows where agents use your tools, ask for approval when needed, and leave a trace of what they did.',
    logo: 'brand/automation-icon.svg',
    needsCloud: true
  },
  { id: 'data', name: 'Data', tagline: 'Explore and transform structured data.', description: 'Work on tables and files with an agent at your side.', icon: <ChartHistogram size={20} /> },
  { id: 'inbox', name: 'Inbox', tagline: 'A connected mailbox with agent triage.', description: 'Sort and answer mail with an agent that knows your context.', icon: <MailOpen size={20} /> },
  { id: 'companion', name: 'Companion', tagline: 'A roster of agent personas.', description: 'Keep agents with their own role, tone and memory.', icon: <Robot size={20} /> },
  { id: 'team', name: 'Team', tagline: 'Agents and people working together.', description: 'Share agents and follow multi-agent work as a team.', icon: <Peoples size={20} /> }
]
