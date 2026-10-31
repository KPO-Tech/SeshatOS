import { useLocation, useNavigate } from 'react-router'
import { SettingTwo } from '@icon-park/react'
import { SidebarItem } from '@renderer/components/layout/sidebar/SidebarItem'
import { edition } from '@renderer/lib/edition'
import { groupSections, visibleSections } from './sections'

/** The sidebar of Settings. While Settings is open it takes the place of the main navigation; the menu below stays. */
export function SettingsNav({ collapsed }: { collapsed: boolean }) {
  const { pathname, state } = useLocation()
  const navigate = useNavigate()
  const current = pathname.split('/')[2]
  const groups = groupSections(visibleSections(edition))

  return (
    <nav className={`no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-1 pt-3.5 ${collapsed ? 'items-center' : ''}`} aria-label="Settings">
      <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : 'px-2.5'}`}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
          <SettingTwo theme="filled" size={16} fill="currentColor" />
        </span>
        {!collapsed && (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">Settings</span>
            <span className="truncate text-[11px] text-[var(--text-muted)]">{edition.accounts ? 'This account' : 'This device'}</span>
          </span>
        )}
      </div>

      {groups.map(([group, items]) => (
        <div key={group} className={`flex flex-col gap-px ${collapsed ? 'items-center' : ''}`}>
          {collapsed ? (
            <div className="mb-1 h-px w-5 bg-[var(--border-soft)]" aria-hidden="true" />
          ) : (
            <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{group}</div>
          )}
          {items.map((section) => {
            const Icon = section.icon
            return (
              <SidebarItem
                key={section.id}
                icon={<Icon theme="outline" size={16} />}
                label={section.label}
                collapsed={collapsed}
                active={current === section.id}
                // Moving between pages of Settings keeps the page the person came from, and does not stack the history.
                onClick={() => navigate(`/settings/${section.id}`, { replace: true, state })}
              />
            )
          })}
        </div>
      ))}
    </nav>
  )
}
