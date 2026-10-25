import { useLocation, useNavigate } from 'react-router'
import { SidebarItem } from '@renderer/components/layout/sidebar/SidebarItem'
import { KNOWLEDGE_NAV, tabFromPath, type KnowledgeTab } from '../nav'
import { useCanManageKnowledge } from '../useCanManage'

// The sidebar of the Knowledge platform. While it is open it takes the place of the main sidebar's navigation; the Store entry and the
// SeshatOS menu below stay. The pages that manage Knowledge are left out for a person who may not.
export function KnowledgeNav({ collapsed }: { collapsed: boolean }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { allowed: canManage } = useCanManageKnowledge()
  const active = tabFromPath(pathname)

  function select(tab: KnowledgeTab) {
    navigate(tab === 'ask' ? '/knowledge' : `/knowledge/${tab}`)
  }

  return (
    <nav className={`flex flex-col gap-4 px-2 pb-1 pt-3.5 ${collapsed ? 'items-center' : ''}`} aria-label="Knowledge">
      <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : 'px-2.5'}`}>
        <img src="brand/knowledge-icon.svg" alt="" width={collapsed ? 26 : 28} height={collapsed ? 26 : 28} className="rounded-[22%]" />
        {!collapsed && <span className="text-[14px] font-semibold text-[var(--text-primary)]">Knowledge</span>}
      </div>

      {KNOWLEDGE_NAV.map((group) => {
        const items = group.items.filter((item) => canManage || !item.adminOnly)
        if (items.length === 0) return null
        return (
          <div key={group.title} className={`flex flex-col gap-px ${collapsed ? 'items-center' : ''}`}>
            {collapsed ? (
              <div className="mb-1 h-px w-5 bg-[var(--border-soft)]" aria-hidden="true" />
            ) : (
              <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{group.title}</div>
            )}
            {items.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                badge={item.ready ? undefined : 'Soon'}
                collapsed={collapsed}
                active={active === item.id}
                onClick={() => select(item.id)}
              />
            ))}
          </div>
        )
      })}
    </nav>
  )
}
