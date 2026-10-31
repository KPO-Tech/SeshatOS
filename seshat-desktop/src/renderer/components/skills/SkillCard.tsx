import { CheckOne, Down, Download, More, Play } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { SkillIconTile } from './SkillIconTile'
import type { SkillIconId } from './skillIcons'
import type { Skill } from './skillsTypes'

const CARD = 'flex min-w-0 flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4'

export function TagRow({ tags }: { tags: string[] }) {
  return (
    <div className="mt-3 flex min-h-[26px] flex-wrap gap-1.5 overflow-hidden">
      {tags.map((tag) => (
        <span key={tag} className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
          {tag}
        </span>
      ))}
    </div>
  )
}

function MenuButton({ label, toggle, children }: { label: string; toggle: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={toggle} className="flex size-7 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
      {children}
    </button>
  )
}

type Props = {
  skill: Skill
  icon: SkillIconId
  tags: string[]
  /** The menu behind the dots: what changes the skill's look or removes it. */
  moreItems: DropdownItem[]
  /** The menu behind the arrow: what is done with the skill. */
  useItems: DropdownItem[]
  onOpen: () => void
}

/** An installed skill: what it is, what it is about, and the button to open it. */
export function SkillCard({ skill, icon, tags, moreItems, useItems, onOpen }: Props) {
  return (
    <div className={CARD}>
      <div className="flex items-start gap-3">
        <SkillIconTile icon={icon} size={44} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{skill.display_name || skill.name}</span>
            {skill.source !== 'userSettings' && (
              <span className="shrink-0 text-[var(--accent-primary)]" title="Official">
                <CheckOne theme="filled" size={13} fill="currentColor" />
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[var(--text-muted)]">
            {skill.version ? `v${skill.version}` : skill.source === 'bundled' ? 'Built-in' : skill.source}
            {!skill.enabled && <span className="rounded bg-[var(--surface-muted)] px-1.5 py-px text-[10px] font-semibold">Off</span>}
          </div>
        </div>
        {moreItems.length > 0 && <Dropdown label="More about this skill" items={moreItems} trigger={({ toggle }) => <MenuButton label="More about this skill" toggle={toggle}><More theme="outline" size={14} /></MenuButton>} />}
      </div>
      <p className="m-0 mt-3 line-clamp-2 min-h-[38px] text-[12.5px] leading-[19px] text-[var(--text-secondary)]">{skill.description}</p>
      <TagRow tags={tags} />
      <div className="mt-3 flex">
        <button type="button" onClick={onOpen} className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-l-xl border border-[var(--border-soft)] bg-transparent text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)]">
          <Play theme="outline" size={13} />
          Open
        </button>
        <Dropdown label="Use this skill" items={useItems} trigger={({ toggle }) => (
          <button type="button" aria-label="Use this skill" onClick={toggle} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-r-xl border border-l-0 border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
            <Down theme="outline" size={14} />
          </button>
        )} />
      </div>
    </div>
  )
}

type AvailableProps = {
  name: string
  description: string
  icon: SkillIconId
  tags: string[]
  busy: boolean
  moreItems: DropdownItem[]
  onInstall: () => void
}

/** A skill that can be installed, and is not yet. */
export function AvailableSkillCard({ name, description, icon, tags, busy, moreItems, onInstall }: AvailableProps) {
  return (
    <div className={CARD}>
      <div className="flex items-start gap-3">
        <SkillIconTile icon={icon} size={44} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{name}</div>
          <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">Not installed</div>
        </div>
        <Dropdown label="More about this skill" items={moreItems} trigger={({ toggle }) => <MenuButton label="More about this skill" toggle={toggle}><More theme="outline" size={14} /></MenuButton>} />
      </div>
      <p className="m-0 mt-3 line-clamp-2 min-h-[38px] text-[12.5px] leading-[19px] text-[var(--text-secondary)]">{description}</p>
      <TagRow tags={tags} />
      <button type="button" disabled={busy} onClick={onInstall} className="mt-3 flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-soft)] bg-transparent text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50">
        <Download theme="outline" size={14} />
        {busy ? 'Installing...' : 'Install'}
      </button>
    </div>
  )
}
