import type { ReactNode } from 'react'
import { ApplicationOne, Book, ChartHistogram, MailOpen, Peoples, Puzzle, Robot, Share, Time } from '@icon-park/react'

// Every platform SeshatOS can host, active or not yet built - the same
// taxonomy legacy seshat-ui already used for its own apps/ directory
// (knowledge, automation, companion, inbox, team), plus the platforms
// already live here under their own sidebar entries. One list, so Store
// stays the single place that says what exists and what's still ahead.
//
// color gives each app its own identity on the icon tile (muted, not a full
// saturated brand color - matches the "warm dark, muted depth" palette
// rather than a loud app-store rainbow). Reuses the existing accent tokens
// where one already fits; the rest are one-off hex values in the same
// desaturated register.
export type StoreApp = {
  id: string
  name: string
  description: string
  icon: ReactNode
  color: string
  route?: string
}

export const ACTIVE_APPS: StoreApp[] = [
  { id: 'skills', name: 'Skills', description: 'Reusable capabilities your agents can call on.', icon: <ApplicationOne size={22} />, color: 'var(--accent-info)', route: '/skills' },
  { id: 'plugins', name: 'Plugins', description: 'Connect external accounts and MCP tools.', icon: <Puzzle size={22} />, color: '#9b8cd9', route: '/plugins' },
  { id: 'scheduling', name: 'Scheduling', description: 'Run tasks on a timer, even while this app is closed.', icon: <Time size={22} />, color: 'var(--accent-primary)', route: '/scheduling' }
]

export const COMING_SOON_APPS: StoreApp[] = [
  { id: 'knowledge', name: 'Knowledge', description: 'Turn your documents and connected sources into searchable, agent-ready knowledge.', icon: <Book size={22} />, color: 'var(--accent-success)' },
  { id: 'data', name: 'Data', description: 'Explore and transform structured data with an agent at your side.', icon: <ChartHistogram size={22} />, color: '#5fb8c9' },
  { id: 'inbox', name: 'Inbox', description: 'A connected mailbox with agent-assisted triage.', icon: <MailOpen size={22} />, color: 'var(--accent-warning)' },
  { id: 'automation', name: 'Automation', description: 'Visual, governed multi-agent workflows.', icon: <Share size={22} />, color: 'var(--accent-danger)' },
  { id: 'companion', name: 'Companion', description: 'A custom roster of agent personas.', icon: <Robot size={22} />, color: '#d98cc0' },
  { id: 'team', name: 'Team', description: 'Multi-agent collaboration and team management.', icon: <Peoples size={22} />, color: '#8f9bb3' }
]
