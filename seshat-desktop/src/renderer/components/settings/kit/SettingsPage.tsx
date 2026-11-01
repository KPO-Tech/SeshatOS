import type { ReactNode } from 'react'
import { edition } from '@renderer/lib/edition'
import { findSection, type SettingsSectionId } from '../page/sections'

type Props = {
  id: SettingsSectionId
  badge?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
  children: ReactNode
}

/** The frame every page of Settings shares: icon tile, title, one line, an optional state badge, tabs, then the cards. */
export function SettingsPage({ id, badge, actions, tabs, children }: Props) {
  const def = findSection(id, edition)
  const Icon = def.icon
  return (
    <div className="pb-6">
      <header className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
          <Icon theme="filled" size={24} fill="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[22px] font-semibold leading-tight text-[var(--text-primary)]">{def.label}</h1>
            {badge}
          </div>
          {def.description && <p className="m-0 mt-1 text-[13px] leading-5 text-[var(--text-muted)]">{def.description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </header>
      {tabs && <div className="mt-5">{tabs}</div>}
      <div className="mt-5 grid gap-4">{children}</div>
    </div>
  )
}
