import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useSessionStore } from '@renderer/stores/session'
import { addProject, listProjects, removeProject, updateProject, type ProjectSummary } from '@renderer/lib/projects'
import { arrangeProjects, countTabs, PROJECT_SORTS, PROJECT_TABS, type ProjectSort, type ProjectTab } from '@renderer/lib/projectsView'
import { ConfirmDialog } from '@renderer/pages/knowledge/collections/ConfirmDialog'
import { Dropdown } from './Dropdown'
import { EditProjectDialog } from './EditProjectDialog'
import { Archive, Folder, FolderPlus, GridView, ListView, Pin, Play, Search, Sort, Time } from './icons'
import { ProjectCard, type ProjectActions } from './ProjectCard'
import { ProjectRow } from './ProjectRow'
import { useFileCounts } from './useFileCounts'

type ViewMode = 'grid' | 'list'

const VIEW_KEY = 'seshat.projects.view'
const SORT_KEY = 'seshat.projects.sort'

function readSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return allowed.includes(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // the choice is kept for this visit only
  }
}

const TAB_ICON: Record<ProjectTab, typeof Folder> = { all: Folder, recent: Time, pinned: Pin, active: Play, archived: Archive }

// Local folders the user works with - see lib/projects.ts for what a "project" actually is here (no backend entity: a folder, with what the
// person says about it). The page finds one, shows what is in it and what it is doing, and starts a conversation in it.
export function ProjectsPage() {
  const navigate = useNavigate()
  const sessions = useSessionStore((state) => state.sessions)
  const streaming = useSessionStore((state) => state.isStreamingBySession)
  const setActive = useSessionStore((state) => state.setActive)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<ProjectTab>('all')
  const [sort, setSort] = useState<ProjectSort>(() => readSetting<ProjectSort>(SORT_KEY, PROJECT_SORTS.map((item) => item.id), 'recent'))
  const [mode, setMode] = useState<ViewMode>(() => readSetting<ViewMode>(VIEW_KEY, ['grid', 'list'], 'grid'))
  const [editing, setEditing] = useState<ProjectSummary | null>(null)
  const [removing, setRemoving] = useState<ProjectSummary | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  // "2 hours ago" stays true while the page is open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const projects = useMemo(
    () => listProjects(sessions, streaming),
    [sessions, streaming, refresh] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const files = useFileCounts(useMemo(() => projects.map((project) => project.rootPath), [projects]))
  const counts = useMemo(() => countTabs(projects, now), [projects, now])
  const shown = useMemo(() => arrangeProjects(projects, { tab, query, sort }, now), [projects, tab, query, sort, now])

  const changed = () => setRefresh((n) => n + 1)

  const actions: ProjectActions = {
    open: (project) => navigate(`/projects/${encodeURIComponent(project.id)}`),
    startSession: (project) => {
      navigate(`/?project=${encodeURIComponent(project.rootPath)}`)
      setActive(null)
    },
    continueSession: (project) => {
      if (!project.lastSessionId) return
      setActive(project.lastSessionId)
      navigate(`/conversation/${project.lastSessionId}`)
    },
    openFolder: (project) => void window.seshat?.openPath?.(project.rootPath),
    edit: setEditing,
    togglePinned: (project) => {
      updateProject(project.id, project.rootPath, { pinned: !project.pinned })
      changed()
    },
    toggleArchived: (project) => {
      updateProject(project.id, project.rootPath, { archived: !project.archived, pinned: false })
      changed()
    },
    remove: setRemoving
  }

  async function handleNewProject() {
    const result = await window.seshat?.dialog?.openDirectory?.()
    if (!result || result.canceled || !result.filePaths?.length) return
    const project = addProject(result.filePaths[0])
    // A project is worth a name, a line about it and tags, and the person has just chosen it: ask for them now, over the list where the new
    // card is. Closing the dialog keeps the project with the name of its folder.
    setTab('all')
    setQuery('')
    const added = listProjects(sessions, streaming).find((item) => item.id === project.id)
    changed()
    if (added) setEditing(added)
    else navigate(`/projects/${encodeURIComponent(project.id)}`)
  }

  const sortLabel = PROJECT_SORTS.find((item) => item.id === sort)?.label ?? 'Sort by'
  const emptyAll = projects.length === 0

  return (
    <section className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-8 pt-5">
      <div className="mx-auto w-full max-w-[1280px]">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[var(--accent-primary)]" style={{ background: 'color-mix(in srgb, var(--accent-primary) 16%, transparent)' }}>
              <Folder theme="filled" size={20} />
            </span>
            <div className="min-w-0">
              <h1 className="m-0 text-[19px] font-semibold leading-tight text-[var(--text-primary)]">Projects</h1>
              <p className="m-0 mt-0.5 text-[12px] text-[var(--text-muted)]">Open, organize and work with your local projects. Start a session, explore files, or continue where you left off.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleNewProject()}
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--accent-primary)] px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <FolderPlus size={14} />
            New project
          </button>
        </header>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <Search size={15} />
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects by name, folder, description or tag..."
              aria-label="Search projects"
              className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-9 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <div className="flex shrink-0 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-0.5" role="group" aria-label="View">
            {(['grid', 'list'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                aria-label={value === 'grid' ? 'Grid view' : 'List view'}
                onClick={() => {
                  setMode(value)
                  saveSetting(VIEW_KEY, value)
                }}
                className={`flex size-8 cursor-pointer items-center justify-center rounded-md border-0 ${mode === value ? 'bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                {value === 'grid' ? <GridView size={15} /> : <ListView size={15} />}
              </button>
            ))}
          </div>
          <Dropdown
            label="Sort projects"
            items={PROJECT_SORTS.map((item) => ({
              id: item.id,
              label: item.label,
              checked: item.id === sort,
              onSelect: () => {
                setSort(item.id)
                saveSetting(SORT_KEY, item.id)
              }
            }))}
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} aria-haspopup="menu" className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
                <Sort size={14} className="text-[var(--text-muted)]" />
                {sortLabel}
                <span className="text-[var(--text-muted)]">&#9662;</span>
              </button>
            )}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Show">
          {PROJECT_TABS.map((item) => {
            const Icon = TAB_ICON[item.id]
            const selected = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors ${selected ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
              >
                <Icon size={14} />
                {item.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] leading-none ${selected ? 'bg-black/20 text-white' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{counts[item.id]}</span>
              </button>
            )
          })}
        </div>

        {shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-24 text-center">
            <Folder size={24} className="mb-1 text-[var(--text-muted)]" />
            <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{emptyAll ? 'No projects yet' : 'No projects here'}</h2>
            <p className="m-0 max-w-[360px] text-[13px] leading-[1.6] text-[var(--text-muted)]">
              {emptyAll ? 'Add a folder, or pick one from the composer next time you start a chat.' : query ? 'Try a different search.' : 'Nothing in this tab yet.'}
            </p>
            {emptyAll && (
              <button type="button" onClick={() => void handleNewProject()} className="mt-3 cursor-pointer rounded-xl border-0 bg-[var(--accent-primary)] px-4 py-2 text-[13.5px] font-semibold text-white hover:opacity-90">
                New project
              </button>
            )}
          </div>
        ) : mode === 'grid' ? (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {shown.map((project) => (
              <ProjectCard key={project.id} project={project} files={files[project.rootPath]} now={now} actions={actions} />
            ))}
          </div>
        ) : (
          <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
            {shown.map((project) => (
              <ProjectRow key={project.id} project={project} files={files[project.rootPath]} now={now} actions={actions} />
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <EditProjectDialog
          project={editing}
          onClose={() => setEditing(null)}
          onSave={(details) => {
            updateProject(editing.id, editing.rootPath, details)
            setEditing(null)
            changed()
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Remove the project"
          message={`${removing.name} is taken off this list. The folder and its files are not touched.`}
          confirmLabel="Remove"
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            removeProject(removing.id)
            setRemoving(null)
            changed()
          }}
        />
      )}
    </section>
  )
}
