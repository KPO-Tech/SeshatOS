import { CheckOne, Down, Download, LinkOne, Loading, More, Play } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { SourceLink } from '@renderer/components/ui/SourceLink'
import { SkillMark } from './SkillIconTile'
import { progressOf, stepLabel } from '@renderer/lib/taskView'
import type { TaskInfo } from '@renderer/lib/tasks'
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
  /** The logo of the repository the skill comes from, when it has one. */
  logo?: string
  /** The address of the repository the skill comes from, when it is known. */
  source?: string
  tags: string[]
  /** The menu behind the dots: what changes the skill's look or removes it. */
  moreItems: DropdownItem[]
  /** The menu behind the arrow: what is done with the skill. */
  useItems: DropdownItem[]
  onOpen: () => void
}

/** An installed skill: what it is, what it is about, and the button to open it. */
export function SkillCard({ skill, icon, logo, source, tags, moreItems, useItems, onOpen }: Props) {
  return (
    <div className={CARD}>
      <div className="flex items-start gap-3">
        <SkillMark icon={icon} logo={logo} title={skill.display_name || skill.name} size={44} />
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
      {source && <SourceLink url={source} className="mt-2" />}
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
  logo?: string
  /** The address of the repository: its owner is shown, and the page can be opened. */
  url: string
  category?: string
  skillCount?: number
  needs: string[]
  busy: boolean
  /** The installation of this repository, when one is going on in the background. */
  installTask?: TaskInfo
  onCancelInstall?: () => void
  moreItems: DropdownItem[]
  onInstall: () => void
  onViewSource: () => void
}

/**
 * A skill that can be installed, and is not yet. It is drawn apart from the installed ones: a tinted head, who publishes it and how many
 * skills it holds, what it needs on the machine, and a filled Install button.
 */
export function AvailableSkillCard({ name, description, icon, logo, url, category, skillCount, needs, busy, installTask, onCancelInstall, moreItems, onInstall, onViewSource }: AvailableProps) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-dashed border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--accent-primary)_4%,var(--surface-panel))]">
      <div className="flex items-start gap-3 bg-[color-mix(in_srgb,var(--accent-primary)_7%,transparent)] px-4 pb-3 pt-4">
        <SkillMark icon={icon} logo={logo} title={name} size={52} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="truncate text-[14.5px] font-semibold text-[var(--text-primary)]">{name}</div>
          <SourceLink url={url} className="mt-0.5" />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {category && <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--accent-primary)]">{category}</span>}
            {skillCount ? <span className="text-[11px] text-[var(--text-muted)]">{skillCount} {skillCount === 1 ? 'skill' : 'skills'}</span> : null}
          </div>
        </div>
        <Dropdown label="More about this skill" items={moreItems} trigger={({ toggle }) => <MenuButton label="More about this skill" toggle={toggle}><More theme="outline" size={14} /></MenuButton>} />
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <p className="m-0 line-clamp-3 min-h-[57px] text-[12.5px] leading-[19px] text-[var(--text-secondary)]">{description}</p>
        {needs.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            Needs
            {needs.map((need) => (
              <span key={need} className="rounded-md border border-[var(--border-soft)] px-1.5 py-0.5 text-[var(--text-secondary)]">
                {need}
              </span>
            ))}
          </div>
        )}
        {installTask ? (
          <div className="mt-auto grid gap-1.5 pt-3" aria-live="polite">
            <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--text-secondary)]">
              <span className="flex min-w-0 items-center gap-1.5">
                <Loading theme="outline" size={13} className="shrink-0 animate-spin text-[var(--accent-primary)]" />
                <span className="truncate">{stepLabel(installTask)}</span>
              </span>
              {onCancelInstall && (
                <button type="button" onClick={onCancelInstall} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--accent-danger)]">
                  Cancel
                </button>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressOf(installTask) * 100)}>
              <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-500" style={{ width: `${Math.round(progressOf(installTask) * 100)}%` }} />
            </div>
          </div>
        ) : (
        <div className="mt-auto flex gap-2 pt-3">
          <button type="button" disabled={busy} onClick={onInstall} className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-[var(--accent-primary)] text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-60">
            <Download theme="outline" size={14} />
            {busy ? 'Installing...' : 'Install'}
          </button>
          <button type="button" onClick={onViewSource} aria-label="View the source" title="View the source" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
            <LinkOne theme="outline" size={14} />
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
