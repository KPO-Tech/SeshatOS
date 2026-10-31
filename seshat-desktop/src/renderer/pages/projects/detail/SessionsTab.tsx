import { useState } from 'react'
import { api } from '@renderer/api/client'
import { deleteSession } from '@renderer/lib/deleteSession'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { relativeTime } from '@renderer/lib/projectsView'
import { useSessionStore, type ChatSession } from '@renderer/stores/session'
import { Delete, Edit, Plus } from '../icons'

type Props = {
  sessions: ChatSession[]
  activeId: string | null
  now: number
  onOpen: (id: string) => void
  onNewChat: () => void
  /** Called after a conversation was deleted, with its id. */
  onDeleted: (id: string) => void
}

/** The conversations that were had in a project: open, rename or delete one, or start another. */
export function SessionsTab({ sessions, activeId, now, onOpen, onNewChat, onDeleted }: Props) {
  const updateSession = useSessionStore((state) => state.updateSession)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  async function commitRename(id: string) {
    const next = title.trim()
    setRenaming(null)
    setTitle('')
    if (!next) return
    updateSession(id, { title: next, updatedAt: new Date().toISOString() })
    try {
      await api.patch(`/sessions/${id}`, { title: next })
    } catch {
      // The title stays here; it is sent again at the next rename.
    }
  }

  async function remove(id: string) {
    setDeleting(null)
    try {
      await deleteSession(id)
      onDeleted(id)
    } catch {
      // The row stays: nothing was deleted.
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {sessions.length} conversation{sessions.length === 1 ? '' : 's'}
        </span>
        <button type="button" onClick={onNewChat} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--accent-primary)] px-3 text-[12.5px] font-semibold text-white hover:opacity-90">
          <Plus size={13} />
          New chat in this project
        </button>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-16 text-center">
            <h3 className="m-0 text-[14px] font-semibold text-[var(--text-primary)]">No conversations yet</h3>
            <p className="m-0 text-[12.5px] text-[var(--text-muted)]">Start a chat in this project and it will show up here.</p>
          </div>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 ${session.id === activeId ? 'bg-[var(--surface-hover)]' : 'hover:bg-[var(--surface-hover)]'}`}>
              {renaming === session.id ? (
                <input
                  value={title}
                  autoFocus
                  aria-label="Name of the conversation"
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => void commitRename(session.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitRename(session.id)
                    } else if (event.key === 'Escape') {
                      setRenaming(null)
                      setTitle('')
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-[var(--accent-primary)] bg-[var(--surface-root)] px-2 py-1 text-[13px] text-[var(--text-primary)] outline-none"
                />
              ) : (
                <button type="button" onClick={() => onOpen(session.id)} className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-0 text-left">
                  <span className="truncate text-[13px] text-[var(--text-primary)]">{session.title || UNTITLED_SESSION_TITLE}</span>
                  <span className="shrink-0 text-[11.5px] text-[var(--text-muted)]">{relativeTime(session.updatedAt || session.createdAt, now)}</span>
                </button>
              )}
              {deleting === session.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => setDeleting(null)} className="cursor-pointer rounded-md border border-[var(--border-soft)] bg-transparent px-2 py-0.5 text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                    Cancel
                  </button>
                  <button type="button" onClick={() => void remove(session.id)} className="cursor-pointer rounded-md border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 px-2 py-0.5 text-[11.5px] font-semibold text-[var(--accent-danger)]">
                    Delete
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label="Rename the conversation"
                    onClick={() => {
                      setRenaming(session.id)
                      setTitle((session.title || UNTITLED_SESSION_TITLE).trim())
                    }}
                    className="flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                  >
                    <Edit size={12} />
                  </button>
                  <button type="button" aria-label="Delete the conversation" onClick={() => setDeleting(session.id)} className="flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--accent-danger)]">
                    <Delete size={12} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
