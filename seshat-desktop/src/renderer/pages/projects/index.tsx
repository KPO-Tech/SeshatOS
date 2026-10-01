import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Edit, Folder, FolderPlus, Search, Delete } from '@icon-park/react'
import { useSessionStore } from '@renderer/stores/session'
import { addProject, listProjects, removeProject, renameProject, type ProjectSummary } from '@renderer/lib/projects'

function fmtActivity(iso: string | null): string {
  if (!iso) return 'No activity yet'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'No activity yet'
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Active now'
  if (diffMin < 60) return `Active ${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `Active ${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `Active ${diffDay}d ago`
  return `Active ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

// Local folders the user works with - see lib/projects.ts for what a
// "project" actually is here (no backend entity, just a labeled path).
// Deliberately not what the old seshat-ui version did: no embedded
// terminal, no per-project settings - find a project, see what's in it,
// jump into a conversation.
export function ProjectsPage() {
  const navigate = useNavigate()
  const sessions = useSessionStore((s) => s.sessions)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const projects = useMemo(
    () => listProjects(sessions),
    [sessions, refreshNonce], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(q) || p.rootPath.toLowerCase().includes(q))
  }, [projects, query])

  async function handleNewProject() {
    const result = await window.nexus?.dialog?.openDirectory?.()
    if (!result || result.canceled || !result.filePaths?.length) return
    const project = addProject(result.filePaths[0])
    navigate(`/projects/${encodeURIComponent(project.id)}`)
  }

  function startRename(project: ProjectSummary) {
    setEditingId(project.id)
    setEditingName(project.name)
  }

  function commitRename(project: ProjectSummary) {
    const nextName = editingName.trim()
    setEditingId(null)
    if (!nextName || nextName === project.name) return
    renameProject(project.id, nextName, project.rootPath)
    setRefreshNonce((n) => n + 1)
  }

  function handleRemove(id: string) {
    setDeletingId(null)
    removeProject(id)
    setRefreshNonce((n) => n + 1)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">Projects</h1>
        <button
          type="button"
          onClick={() => void handleNewProject()}
          className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
        >
          <FolderPlus size={13} />
          New project
        </button>
      </div>

      <div className="relative mt-3 shrink-0">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"><Search size={16} /></span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-9 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 pb-16 text-center">
          <Folder size={22} className="mb-1 text-[var(--text-muted)]" />
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{projects.length === 0 ? 'No projects yet' : 'No matches'}</h2>
          <p className="max-w-[320px] text-[12px] leading-[1.6] text-[var(--text-muted)]">
            {projects.length === 0
              ? 'Add a folder, or pick one from the composer next time you start a chat.'
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pb-8">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
            {filtered.map((project) => (
              <div key={project.id} className="group relative rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] transition-colors hover:bg-[var(--surface-muted)]">
                {deletingId === project.id ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-[var(--surface-panel)] p-3 text-center">
                    <span className="text-[12px] text-[var(--text-primary)]">Remove this project?</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setDeletingId(null)} className="cursor-pointer rounded-md border border-[var(--border-soft)] bg-transparent px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                        Cancel
                      </button>
                      <button type="button" onClick={() => handleRemove(project.id)} className="cursor-pointer rounded-md border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-danger)]">
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" aria-label="Rename" onClick={() => startRename(project)} className="flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
                      <Edit size={12} />
                    </button>
                    <button type="button" aria-label="Remove" onClick={() => setDeletingId(project.id)} className="flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-danger)]">
                      <Delete size={12} />
                    </button>
                  </div>
                )}

                {/* A real <button> can't contain the rename <input> (nested
                    interactive elements are invalid HTML), so this is a div
                    with button semantics instead - same pattern used for
                    ToolLineItem/ThinkingBlock's rows. */}
                <div
                  className="flex flex-col items-start p-3 text-left"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/projects/${encodeURIComponent(project.id)}`) } }}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-secondary)]"><Folder size={16} /></span>
                  {editingId === project.id ? (
                    <input
                      className="mt-2.5 w-full rounded-md border border-[var(--accent-primary)] bg-[var(--surface-root)] px-2 py-1 text-[13px] font-semibold text-[var(--text-primary)] outline-none"
                      value={editingName}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => commitRename(project)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(project) }
                        else if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                  ) : (
                    <span className="mt-2.5 w-full truncate text-[13px] font-semibold text-[var(--text-primary)]">{project.name}</span>
                  )}
                  <span className="w-full truncate font-mono text-[10.5px] text-[var(--text-muted)]">{project.rootPath}</span>
                  <span className="mt-2.5 text-[11px] text-[var(--text-muted)]">
                    {project.sessionCount} session{project.sessionCount === 1 ? '' : 's'} - {fmtActivity(project.lastActiveAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
