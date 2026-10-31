import type { ReactNode } from 'react'
import { Download, More, SettingTwo } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { BrandIcon } from './catalog/BrandIcon'

export type PluginState = 'installed' | 'available' | 'attention'

type Props = {
  title: string
  description: string
  brand?: string
  /** Icon override for entries with no brand mark (MCP servers). */
  icon?: ReactNode
  state: PluginState
  /** The words that say what the plugin is for. */
  tags: string[]
  /** The word of the badge when it is not connected ("Not installed", "Off"). */
  offLabel?: string
  menu: DropdownItem[]
  layout: 'grid' | 'list'
  onOpen: () => void
}

const BADGE: Record<PluginState, string> = {
  installed: 'bg-[color-mix(in_srgb,var(--accent-success)_16%,transparent)] text-[var(--accent-success)]',
  attention: 'bg-[color-mix(in_srgb,var(--accent-danger)_16%,transparent)] text-[var(--accent-danger)]',
  available: 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'
}

function stateLabel(state: PluginState, offLabel: string): string {
  if (state === 'installed') return 'Installed'
  if (state === 'attention') return 'Needs attention'
  return offLabel
}

function Tags({ tags }: { tags: string[] }) {
  const shown = tags.slice(0, 3)
  const more = tags.length - shown.length
  return (
    <div className="flex min-h-[26px] flex-wrap gap-1.5 overflow-hidden">
      {shown.map((tag) => (
        <span key={tag} className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
          {tag}
        </span>
      ))}
      {more > 0 && <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">+{more}</span>}
    </div>
  )
}

function Action({ state, onOpen, compact }: { state: PluginState; onOpen: () => void; compact?: boolean }) {
  const height = compact ? 'h-8' : 'h-9'
  if (state === 'available') {
    return (
      <button type="button" onClick={onOpen} className={`${height} flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90`}>
        <Download theme="outline" size={14} />
        Install
      </button>
    )
  }
  return (
    <button type="button" onClick={onOpen} className={`${height} flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-soft)] bg-transparent px-4 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]`}>
      <SettingTwo theme="outline" size={14} />
      Configure
    </button>
  )
}

function Menu({ items }: { items: DropdownItem[] }) {
  return (
    <Dropdown
      label="More about this plugin"
      items={items}
      trigger={({ toggle }) => (
        <button type="button" aria-label="More about this plugin" onClick={toggle} className="flex size-9 cursor-pointer items-center justify-center rounded-xl border border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
          <More theme="outline" size={15} />
        </button>
      )}
    />
  )
}

/** A plugin, as a card or as a row: what it is, whether it is connected, and the one thing to do with it. */
export function PluginTile({ title, description, brand, icon, state, tags, offLabel = 'Not installed', menu, layout, onOpen }: Props) {
  const tile = icon ?? <BrandIcon brand={brand} title={title} size={layout === 'grid' ? 52 : 40} />
  const badge = <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${BADGE[state]}`}>{stateLabel(state, offLabel)}</span>

  if (layout === 'list') {
    return (
      <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3">
        {tile}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="m-0 truncate text-[14px] font-semibold text-[var(--text-primary)]">{title}</h3>
            {badge}
          </div>
          <p className="m-0 mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">{description}</p>
        </div>
        <div className="flex w-[230px] shrink-0 gap-2">
          <Action state={state} onOpen={onOpen} compact />
          <Menu items={menu} />
        </div>
      </article>
    )
  }

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-start gap-3">
        {tile}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="m-0 max-w-full truncate text-[14px] font-semibold text-[var(--text-primary)]">{title}</h3>
            {badge}
          </div>
          <p className="m-0 mt-1 line-clamp-2 min-h-[38px] text-[12.5px] leading-[19px] text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      <div className="mt-3">
        <Tags tags={tags} />
      </div>
      <div className="mt-3 flex gap-2">
        <Action state={state} onOpen={onOpen} />
        <Menu items={menu} />
      </div>
    </article>
  )
}
