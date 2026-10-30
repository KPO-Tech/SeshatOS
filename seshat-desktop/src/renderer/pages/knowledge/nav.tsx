import type { ReactNode } from 'react'
import { FolderOpen, Message, PlugOne, Search, SettingTwo } from '@icon-park/react'

export type KnowledgeTab = 'ask' | 'search' | 'collections' | 'sources' | 'settings'

export type KnowledgeNavItem = {
  id: KnowledgeTab
  label: string
  icon: ReactNode
  // Built pages open; the others show what they will do.
  ready: boolean
  adminOnly?: boolean
}

export const KNOWLEDGE_NAV: Array<{ title: string; items: KnowledgeNavItem[] }> = [
  {
    title: 'Ask',
    items: [
      { id: 'ask', label: 'Ask', icon: <Message size={15} />, ready: true },
      { id: 'search', label: 'Search', icon: <Search size={15} />, ready: true }
    ]
  },
  { title: 'Browse', items: [{ id: 'collections', label: 'Collections', icon: <FolderOpen size={15} />, ready: true }] },
  {
    title: 'Manage',
    items: [
      { id: 'sources', label: 'Sources', icon: <PlugOne size={15} />, ready: true, adminOnly: true },
      { id: 'settings', label: 'Settings', icon: <SettingTwo size={15} />, ready: true, adminOnly: true }
    ]
  }
]

export function tabFromPath(pathname: string): KnowledgeTab {
  const segment = pathname.replace(/^\/knowledge\/?/, '').split('/')[0]
  return KNOWLEDGE_NAV.some((group) => group.items.some((item) => item.id === segment)) ? (segment as KnowledgeTab) : 'ask'
}
