import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ApplicationOne, Down, Plus, Right, Search, SortThree } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { ToastStack, useToast } from '@renderer/components/ui/Toast'
import { openInAppBrowser } from '@renderer/lib/openInAppBrowser'
import { useDialogsStore } from '@renderer/stores/dialogs'
import { AgentsConfig } from './agents/AgentsConfig'
import { AvailableSkillCard, SkillCard } from './SkillCard'
import { SkillIconPicker } from './SkillIconPicker'
import { categoryOf, tagsFor } from './skillIcons'
import { deleteSkill, installSkillRepo, setSkillEnabled } from './skillsApi'
import type { CatalogEntry, Skill } from './skillsTypes'
import { useSkillCatalog } from './useSkillCatalog'
import { useSkillIcons } from './useSkillIcons'
import { filterSkills, useSkills } from './useSkills'

type Tab = 'all' | 'builtin' | 'installed' | 'available' | 'agents'
type Sort = 'name' | 'status'

const PREVIEW = 4
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3'

const matches = (entry: CatalogEntry, query: string) => `${entry.name} ${entry.description}`.toLowerCase().includes(query.trim().toLowerCase())

function Count({ value, active }: { value: number; active?: boolean }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${active ? 'bg-white/25 text-white' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{value}</span>
}

function Section({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="m-0 flex items-center gap-2 text-[16px] font-semibold text-[var(--text-primary)]">
          {title}
          <Count value={count} />
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Pick({ label, value, items }: { label: string; value: string; items: DropdownItem[] }) {
  return (
    <Dropdown
      label={label}
      items={items}
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
          {value}
          <Down theme="outline" size={12} />
        </button>
      )}
    />
  )
}

// What the agent knows how to do (skills) and who it can be (agents): two lists of the same kind, one page.
export function SkillsPage() {
  const { skills, loading, error, reload } = useSkills()
  const { available, reload: reloadCatalog } = useSkillCatalog()
  const { iconOf, isChosen, choose } = useSkillIcons()
  const openConfig = useDialogsStore((state) => state.openConfig)
  const { toasts, show } = useToast()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('name')
  const [category, setCategory] = useState('all')
  const [pickingFor, setPickingFor] = useState<{ name: string; description: string } | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)

  const local = useMemo(() => {
    const listed = filterSkills(skills, { query, collection: 'all', enabledOnly })
    const byName = (a: Skill, b: Skill) => (a.display_name || a.name).localeCompare(b.display_name || b.name)
    return [...listed].sort(sort === 'status' ? (a, b) => Number(b.enabled) - Number(a.enabled) || byName(a, b) : byName)
  }, [skills, query, enabledOnly, sort])
  const builtIn = useMemo(() => local.filter((skill) => skill.source === 'bundled'), [local])
  const installed = useMemo(() => local.filter((skill) => skill.source !== 'bundled'), [local])
  const offered = useMemo(
    () => available.filter((entry) => matches(entry, query) && (category === 'all' || (entry.category ?? categoryOf(entry)) === category)).sort((a, b) => a.name.localeCompare(b.name)),
    [available, query, category]
  )
  const categories = useMemo(() => [...new Set(available.map((entry) => entry.category ?? categoryOf(entry)))].sort(), [available])

  async function toggle(skill: Skill) {
    try {
      await setSkillEnabled(skill.name, !skill.enabled)
      await reload()
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not update this skill.', 'err')
    }
  }

  async function remove(skill: Skill) {
    if (!window.confirm(`Delete "${skill.display_name || skill.name}"? This cannot be undone.`)) return
    try {
      await deleteSkill(skill.name)
      await reload()
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not delete this skill.', 'err')
    }
  }

  async function install(entry: CatalogEntry) {
    setInstalling(entry.name)
    try {
      await installSkillRepo(entry.url)
      await Promise.all([reload(), reloadCatalog()])
      show(`${entry.name} installed.`)
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not install this skill.', 'err')
    } finally {
      setInstalling(null)
    }
  }

  const openSkill = (skill: Skill) => navigate(`/skills/${encodeURIComponent(skill.name)}`)

  const changeIcon = (target: { name: string; description: string }): DropdownItem => ({ id: 'icon', label: 'Change icon', onSelect: () => setPickingFor(target) })

  const installedCard = (skill: Skill) => (
    <SkillCard
      key={skill.name}
      skill={skill}
      icon={iconOf(skill)}
      tags={tagsFor(skill)}
      onOpen={() => openSkill(skill)}
      moreItems={[changeIcon(skill), ...(skill.source === 'userSettings' ? [{ id: 'delete', label: 'Delete', danger: true, onSelect: () => void remove(skill) }] : [])]}
      useItems={[
        { id: 'toggle', label: skill.enabled ? 'Turn off' : 'Turn on', onSelect: () => void toggle(skill) },
        { id: 'details', label: 'View files', onSelect: () => openSkill(skill) }
      ]}
    />
  )

  const availableCard = (entry: CatalogEntry) => (
    <AvailableSkillCard
      key={entry.url}
      name={entry.name}
      description={entry.description}
      icon={iconOf(entry)}
      url={entry.url}
      category={entry.category}
      skillCount={entry.skill_count}
      needs={entry.needs ?? []}
      onViewSource={() => openInAppBrowser(entry.url)}
      busy={installing === entry.name}
      moreItems={[changeIcon(entry)]}
      onInstall={() => void install(entry)}
    />
  )

  const seeAll = (to: Tab) => (
    <button type="button" onClick={() => setTab(to)} className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-medium text-[var(--accent-primary)] hover:underline">
      See all
      <Right theme="outline" size={13} />
    </button>
  )

  const categoryPick = (
    <Pick
      label="Category"
      value={category === 'all' ? 'All categories' : category}
      items={[{ id: 'all', label: 'All categories', checked: category === 'all', onSelect: () => setCategory('all') }, ...categories.map((name) => ({ id: name, label: name, checked: category === name, onSelect: () => setCategory(name) }))]}
    />
  )

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'all', label: 'All skills', count: skills.length + available.length },
    { id: 'builtin', label: 'Built-in', count: skills.filter((skill) => skill.source === 'bundled').length },
    { id: 'installed', label: 'Installed', count: skills.filter((skill) => skill.source !== 'bundled').length },
    { id: 'available', label: 'Available', count: available.length }
  ]

  const nothing = <div className="flex flex-1 items-center justify-center py-16 text-[13px] font-semibold text-[var(--text-muted)]">{skills.length + available.length === 0 ? 'No skills yet - add a repository to get started.' : 'No skills match your filters.'}</div>

  function content() {
    if (tab === 'agents') return <AgentsConfig />
    if (loading) return <div className="flex flex-1 items-center justify-center py-16 text-[13px] font-semibold text-[var(--text-muted)]">Loading...</div>
    if (tab === 'builtin') return builtIn.length === 0 ? nothing : <div className={`${GRID} mt-4`}>{builtIn.map(installedCard)}</div>
    if (tab === 'installed') return installed.length === 0 ? nothing : <div className={`${GRID} mt-4`}>{installed.map(installedCard)}</div>
    if (tab === 'available') {
      return offered.length === 0 ? nothing : (
        <Section title="Available skills" count={offered.length} action={categoryPick}>
          <div className={GRID}>{offered.map(availableCard)}</div>
        </Section>
      )
    }
    if (installed.length + builtIn.length + offered.length === 0) return nothing
    return (
      <>
        {installed.length > 0 && (
          <Section title="Installed skills" count={installed.length} action={installed.length > PREVIEW ? seeAll('installed') : undefined}>
            <div className={GRID}>{installed.slice(0, PREVIEW).map(installedCard)}</div>
          </Section>
        )}
        {builtIn.length > 0 && (
          <Section title="Built-in skills" count={builtIn.length} action={builtIn.length > PREVIEW ? seeAll('builtin') : undefined}>
            <div className={GRID}>{builtIn.slice(0, PREVIEW).map(installedCard)}</div>
          </Section>
        )}
        {offered.length > 0 && (
          <Section title="Available skills" count={offered.length} action={categoryPick}>
            <div className={GRID}>{offered.map(availableCard)}</div>
          </Section>
        )}
      </>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-5">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
            <ApplicationOne theme="filled" size={24} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-semibold leading-tight text-[var(--text-primary)]">{tab === 'agents' ? 'Agents' : 'Skills'}</h1>
            <p className="m-0 mt-0.5 text-[13px] text-[var(--text-muted)]">
              {tab === 'agents' ? 'Choose who the agent can be.' : 'Extend SeshatOS with specialized skills. Each skill can help with a specific task, workflow or domain.'}
            </p>
          </div>
        </div>
        {tab !== 'agents' && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-pressed={enabledOnly}
              onClick={() => setEnabledOnly((value) => !value)}
              className={`h-9 cursor-pointer rounded-lg border px-3.5 text-[13px] font-semibold ${enabledOnly ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--accent-primary)]' : 'border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}
            >
              My skills
            </button>
            <button type="button" onClick={() => openConfig('skills')} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90">
              <Plus theme="outline" size={15} />
              Add skills
            </button>
          </div>
        )}
      </div>

      {tab !== 'agents' && (
        <div className="relative mt-5 shrink-0">
          <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-[var(--text-muted)]">
            <Search theme="outline" size={16} />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills by name, description or tag..."
            className="h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-10 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
      )}

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex flex-wrap items-center gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`flex h-9 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] font-medium ${tab === item.id ? 'border-transparent bg-[var(--accent-primary)] text-white' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}
            >
              {item.label}
              <Count value={item.count ?? 0} active={tab === item.id} />
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-[var(--border-soft)]" aria-hidden="true" />
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'agents'}
            onClick={() => setTab('agents')}
            className={`h-9 cursor-pointer rounded-full border px-4 text-[13px] font-medium ${tab === 'agents' ? 'border-transparent bg-[var(--accent-primary)] text-white' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}
          >
            Agents
          </button>
        </div>
        {tab !== 'agents' && (
          <div className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
            <SortThree theme="outline" size={14} />
            Sort by
            <Pick
              label="Sort by"
              value={sort === 'name' ? 'Name' : 'Status'}
              items={[
                { id: 'name', label: 'Name', checked: sort === 'name', onSelect: () => setSort('name') },
                { id: 'status', label: 'Status', checked: sort === 'status', onSelect: () => setSort('status') }
              ]}
            />
          </div>
        )}
      </div>

      {error && <p className="mt-4 shrink-0 text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</p>}

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-8">
        <div className={tab === 'agents' ? 'mx-auto mt-4 w-full max-w-[920px]' : undefined}>{content()}</div>
      </div>

      {pickingFor && (
        <SkillIconPicker skillName={pickingFor.name} current={iconOf(pickingFor)} chosen={isChosen(pickingFor.name)} onPick={(icon) => choose(pickingFor.name, icon)} onClose={() => setPickingFor(null)} />
      )}
      <ToastStack toasts={toasts} />
    </section>
  )
}
