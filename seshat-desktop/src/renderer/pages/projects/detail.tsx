import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Delete, Edit, Folder, Left, Plus } from '@icon-park/react'
import { useSessionStore } from '@renderer/stores/session'
import { api } from '@renderer/api/client'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { deleteSession } from '@renderer/lib/deleteSession'
import { listProjects, resolveProjectContextPath, selectRecentSessions } from '@renderer/lib/projects'

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

// One project's own sessions, scoped to this project's path. No message preview: synced
// sessions carry empty `messages` until actually opened (useSessionsSync),
// so there's nothing real to show here beyond title and time.
export function ProjectDetailPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const updateSession = useSessionStore((s) => s.updateSession)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const projectPath = useMemo(
    () => resolveProjectContextPath({ projectParam: null, projectRouteId: projectId }, sessions),
    [projectId, sessions],
  )
  const project = useMemo(
    () => (projectId ? listProjects(sessions).find((p) => p.id === projectId) : undefined),
    [projectId, sessions],
  )
  const projectSessions = useMemo(
    () => selectRecentSessions(sessions, projectPath, Number.MAX_SAFE_INTEGER),
    [sessions, projectPath],
  )

  function openSession(id: string) {
    setActive(id)
    navigate(`/conversation/${id}`)
  }

  function startNewChat() {
    if (!projectPath) return
    setActive(null)
    navigate(`/?project=${encodeURIComponent(projectPath)}`)
  }

  function startRename(id: string, currentTitle?: string) {
    setEditingId(id)
    setEditingTitle((currentTitle || UNTITLED_SESSION_TITLE).trim())
  }

  async function commitRename(id: string) {
    const nextTitle = editingTitle.trim()
    setEditingId(null)
    if (!nextTitle) { setEditingTitle(''); return }
    updateSession(id, { title: nextTitle, updatedAt: new Date().toISOString() })
    setEditingTitle('')
    try {
      await api.patch(`/sessions/${id}`, { title: nextTitle })
    } catch {
      // The local title stays; it re-syncs on the next rename.
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(null)
    try {
      await deleteSession(id)
      if (activeId === id) navigate('/')
    } catch {
      // The row stays; nothing else to do here.
    }
  }

  if (!projectPath || !project) {
    return (
      <div className="pdet-root">
        <style>{CSS}</style>
        <div className="pdet-empty">
          <Folder size={22} />
          <h2>Project not found</h2>
          <p>It may have been removed. <a href="#/projects">Back to Projects</a></p>
        </div>
      </div>
    )
  }

  return (
    <div className="pdet-root">
      <style>{CSS}</style>

      <div className="pdet-back-row">
        <button type="button" className="pdet-back" onClick={() => navigate('/projects')}>
          <Left size={12} /> Projects
        </button>
      </div>

      <header className="pdet-header">
        <div className="pdet-header-main">
          <span className="pdet-header-icon"><Folder size={20} /></span>
          <div>
            <h1 className="pdet-title">{project.name}</h1>
            <p className="pdet-path">{project.rootPath}</p>
          </div>
        </div>
        <button className="pdet-new-btn" onClick={startNewChat}>
          <Plus size={13} /> New chat in this project
        </button>
      </header>

      <div className="pdet-body">
        <div className="pdet-container">
          {projectSessions.length === 0 ? (
            <div className="pdet-empty">
              <Folder size={22} />
              <h2>No conversations yet</h2>
              <p>Start a new chat in this project and it will show up here.</p>
            </div>
          ) : (
            <>
              <div className="pdet-count">{projectSessions.length} session{projectSessions.length === 1 ? '' : 's'}</div>
              <div className="pdet-list">
                {projectSessions.map((s) => (
                  <div key={s.id} className={`pdet-row${s.id === activeId ? ' active' : ''}`}>
                    {editingId === s.id ? (
                      <input
                        className="pdet-rename"
                        value={editingTitle}
                        autoFocus
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => { void commitRename(s.id) }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); void commitRename(s.id) }
                          else if (e.key === 'Escape') { setEditingId(null); setEditingTitle('') }
                        }}
                      />
                    ) : (
                      <button type="button" className="pdet-row-main" onClick={() => openSession(s.id)}>
                        <span className="pdet-row-title">{s.title || UNTITLED_SESSION_TITLE}</span>
                        <span className="pdet-row-date">{fmtDate(s.updatedAt || s.createdAt)}</span>
                      </button>
                    )}

                    {deletingId === s.id ? (
                      <div className="pdet-row-confirm">
                        <button className="pdet-confirm-cancel" onClick={() => setDeletingId(null)}>Cancel</button>
                        <button className="pdet-confirm-delete" onClick={() => void handleDelete(s.id)}>Delete</button>
                      </div>
                    ) : (
                      <div className="pdet-row-actions">
                        <button className="pdet-icon-btn" aria-label="Rename" onClick={() => startRename(s.id, s.title)}>
                          <Edit size={12} />
                        </button>
                        <button className="pdet-icon-btn pdet-icon-btn--danger" aria-label="Delete" onClick={() => setDeletingId(s.id)}>
                          <Delete size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.pdet-root {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--surface-panel);
  color: var(--text-primary);
  overflow: hidden;
}

.pdet-back-row { flex-shrink: 0; padding: 18px 24px 0; }
.pdet-back {
  display: inline-flex; align-items: center; gap: 6px;
  border: none; background: transparent; color: var(--text-muted);
  font-size: 11px; font-weight: 700; cursor: pointer; padding: 0;
}
.pdet-back:hover { color: var(--text-primary); }

.pdet-header {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 12px 24px 20px;
}
.pdet-header-main { display: flex; align-items: center; gap: 13px; min-width: 0; }
.pdet-header-icon {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: rgba(239, 124, 47, 0.12); color: var(--accent-primary);
}
.pdet-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--text-primary); }
.pdet-path { margin: 3px 0 0; font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', 'Fira Code', monospace; }

.pdet-new-btn {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 13px; border-radius: 7px;
  border: 1px solid rgba(239, 124, 47, 0.3);
  background: rgba(239, 124, 47, 0.1); color: var(--accent-primary);
  font-size: 11.5px; font-weight: 700; cursor: pointer;
}
.pdet-new-btn:hover { background: rgba(239, 124, 47, 0.16); }

.pdet-body { flex: 1; overflow-y: auto; padding: 0 24px 60px; }
.pdet-container { max-width: 860px; margin: 0 auto; width: 100%; }

.pdet-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 8px; max-width: 380px; margin: 60px auto 0; color: var(--text-muted);
}
.pdet-empty h2 { font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 4px 0 0; }
.pdet-empty p { font-size: 11px; line-height: 1.6; margin: 0; }
.pdet-empty a { color: var(--accent-primary); }

.pdet-count {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 12px; padding: 0 2px;
}

.pdet-list { display: flex; flex-direction: column; gap: 8px; }

.pdet-row {
  display: flex; align-items: stretch; gap: 8px;
  border: 1px solid var(--border-soft); border-radius: 12px;
  background: var(--surface-root);
  padding: 3px;
  transition: border-color 0.15s;
}
.pdet-row:hover { border-color: var(--border-strong); }
.pdet-row.active { border-color: rgba(239, 124, 47, 0.3); }

.pdet-row-main {
  flex: 1; min-width: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  border: none; background: transparent; cursor: pointer;
  padding: 12px 14px; text-align: left; border-radius: 9px;
}
.pdet-row-main:hover { background: var(--surface-hover); }

.pdet-row-title {
  font-size: 12.5px; line-height: 1.5; color: var(--text-primary);
  min-width: 0; flex: 1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pdet-row-date { font-size: 10px; color: var(--text-muted); flex-shrink: 0; white-space: nowrap; }

.pdet-rename {
  flex: 1; min-width: 0;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(239, 124, 47, 0.22);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 11px;
  font-size: 12px;
  outline: none;
  margin: 2px;
}

.pdet-row-actions { display: flex; gap: 3px; flex-shrink: 0; padding-right: 4px; }
.pdet-icon-btn {
  width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border-soft);
  background: transparent; color: var(--text-muted);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.pdet-icon-btn:hover { background: var(--surface-hover); color: var(--text-primary); }
.pdet-icon-btn--danger:hover { background: rgba(var(--color-error-rgb), 0.1); color: var(--accent-danger); }

.pdet-row-confirm { display: flex; gap: 6px; flex-shrink: 0; padding-right: 6px; }
.pdet-confirm-cancel {
  background: transparent; border: 1px solid var(--border-soft); color: var(--text-muted);
  padding: 4px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; white-space: nowrap;
}
.pdet-confirm-delete {
  background: rgba(var(--color-error-rgb), 0.12); border: 1px solid rgba(var(--color-error-rgb), 0.3); color: var(--accent-danger);
  padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
`
