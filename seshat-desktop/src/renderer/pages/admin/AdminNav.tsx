import { Browser, Info, Lock, PlugOne, Robot, SendEmail, Shield, User, Peoples, Earth, LinkFour } from '@icon-park/react'
import type { ReactNode } from 'react'
import type { AdminTab } from './adminTabs'

type NavItem = { id: AdminTab; label: string; icon: ReactNode; ready: boolean }

// `ready: false` items render the "coming soon" placeholder in index.tsx -
// the full intended shape of Admin is visible from day one, sub-features
// swap in one at a time without reshaping the nav each time.
const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Organization',
    items: [
      { id: 'overview', label: 'Overview', icon: <Shield size={15} />, ready: true },
      { id: 'users', label: 'Users', icon: <User size={15} />, ready: true },
      { id: 'teams', label: 'Teams', icon: <Peoples size={15} />, ready: true },
      { id: 'invitations', label: 'Invitations', icon: <SendEmail size={15} />, ready: true },
      { id: 'auditLogs', label: 'Audit Logs', icon: <Info size={15} />, ready: true },
    ],
  },
  {
    title: 'Access & policy',
    items: [
      { id: 'desktopPolicies', label: 'Desktop Policies', icon: <Lock size={15} />, ready: true },
      { id: 'connectors', label: 'Connectors', icon: <PlugOne size={15} />, ready: true },
    ],
  },
  {
    title: 'AI configuration',
    items: [
      { id: 'providers', label: 'Providers', icon: <Browser size={15} />, ready: true },
      { id: 'agents', label: 'Agents', icon: <Robot size={15} />, ready: true },
      { id: 'mcpServers', label: 'MCP Servers', icon: <LinkFour size={15} />, ready: true },
      { id: 'webSearch', label: 'Web Search', icon: <Earth size={15} />, ready: true },
    ],
  },
]

export function adminTabExists(value: string | null): value is AdminTab {
  if (!value) return false
  return NAV_GROUPS.some((group) => group.items.some((item) => item.id === value))
}

export function AdminNav({ activeTab, onSelect }: { activeTab: AdminTab; onSelect: (tab: AdminTab) => void }) {
  return (
    <nav className="flex w-[196px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--border-soft)] px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{group.title}</div>
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-left text-[13px] font-semibold transition duration-100 hover:bg-[var(--surface-hover)] ${
                activeTab === item.id ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className={activeTab === item.id ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}>{item.icon}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {!item.ready && <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" title="Not built yet" />}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
