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
    title: 'knowledge/common:pages.knowledge.nav.groupAsk',
    items: [
      { id: 'ask', label: 'knowledge/common:pages.knowledge.nav.ask', icon: <Message size={15} />, ready: true },
      { id: 'search', label: 'knowledge/common:pages.knowledge.nav.search', icon: <Search size={15} />, ready: true }
    ]
  },
  { title: 'knowledge/common:pages.knowledge.nav.groupBrowse', items: [{ id: 'collections', label: 'knowledge/common:pages.knowledge.nav.collections', icon: <FolderOpen size={15} />, ready: true }] },
  {
    title: 'knowledge/common:pages.knowledge.nav.groupManage',
    items: [
      { id: 'sources', label: 'knowledge/common:pages.knowledge.nav.sources', icon: <PlugOne size={15} />, ready: true, adminOnly: true },
      { id: 'settings', label: 'knowledge/common:pages.knowledge.nav.settings', icon: <SettingTwo size={15} />, ready: true, adminOnly: true }
    ]
  }
]

export function tabFromPath(pathname: string): KnowledgeTab {
  const segment = pathname.replace(/^\/knowledge\/?/, '').split('/')[0]
  return KNOWLEDGE_NAV.some((group) => group.items.some((item) => item.id === segment)) ? (segment as KnowledgeTab) : 'ask'
}
