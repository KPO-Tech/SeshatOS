import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { CheckOne, Delete, Down, Edit, FileTextOne, History, MoreOne, Right, Share } from '@icon-park/react'
import { api } from '@renderer/api/client'
import { deleteSession } from '@renderer/lib/deleteSession'
import { conversationFileName, serializeConversationMarkdown } from '@renderer/lib/conversationExport'
import { isUntitledSessionTitle, UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { useSessionStore, type ChatSession } from '@renderer/stores/session'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const menuButtonClass = 'flex w-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[7px] border-0 bg-transparent px-2 py-[7px] text-left text-[12px] hover:bg-[var(--surface-hover)]'

type Props = {
  sessions: ChatSession[]
  onOpenSession: (id: string) => void
  onOpenHistory: () => void
}

// Recents block of the sidebar: the latest chats of the current scope (Home, or
// the open project) with a per-chat rename / export / delete menu. Browsing
// everything and bulk operations live in the history modal.
export function RecentSessions({ sessions, onOpenSession, onOpenHistory }: Props) {
  const activeId = useSessionStore((state) => state.activeId)
  const updateSession = useSessionStore((state) => state.updateSession)
  const agentStates = useSessionStore((state) => state.agentStates)
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if ((event.target as HTMLElement | null)?.closest('.sb-recent-menu-wrap')) return
      setMenuSessionId(null)
    }
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [])

  async function handleDelete(session: ChatSession) {
    setMenuSessionId(null)
    try {
      await deleteSession(session.id)
      if (activeId === session.id) navigate('/')
    } catch {
      // The row stays; nothing else to do here.
    }
  }

  async function handleExport(session: ChatSession) {
    setMenuSessionId(null)
    const markdown = serializeConversationMarkdown(session)
    await window.nexus?.saveFile?.(conversationFileName(session), markdown).catch(() => {})
  }

  async function handleShare(session: ChatSession) {
    const markdown = serializeConversationMarkdown(session)
    try {
      await navigator.clipboard.writeText(markdown)
      setCopiedId(session.id)
      setTimeout(() => {
        setCopiedId((current) => (current === session.id ? null : current))
        setMenuSessionId((current) => (current === session.id ? null : current))
      }, 1200)
    } catch {
      // No feedback shown on failure; the menu stays open so the user can retry.
    }
  }

  function startRename(id: string, currentTitle?: string) {
    setMenuSessionId(null)
    setEditingId(id)
    setEditingTitle((currentTitle || UNTITLED_SESSION_TITLE).trim())
  }

  async function commitRename(session: ChatSession) {
    const nextTitle = editingTitle.trim()
    setEditingId(null)
    setEditingTitle('')
    if (!nextTitle) return
    updateSession(session.id, { title: nextTitle, updatedAt: new Date().toISOString() })
    try {
      await api.patch(`/sessions/${session.id}`, { title: nextTitle })
    } catch {
      // The local title stays; it re-syncs on the next rename.
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        <button
          className="flex min-w-0 flex-1 items-center justify-between border-0 bg-transparent px-2 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span>Tasks</span>
          {open ? <Down size={12} /> : <Right size={12} />}
        </button>
        <button
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-[var(--text-muted)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          type="button"
          aria-label="History"
          title="History"
          onClick={onOpenHistory}
        >
          <History size={13} />
        </button>
      </div>

      {open && (
        <div className="mt-1 flex flex-col gap-px overflow-visible">
          {sessions.map((session) => {
            const active = session.id === activeId
            const menuOpen = menuSessionId === session.id
            const agentState = agentStates[session.id]
            const isBusy = Boolean(agentState?.isThinking || agentState?.activeTool)
            return (
              <div key={session.id} className={cx('group relative flex items-center overflow-visible rounded-md', active ? 'bg-[var(--surface-hover)]' : 'hover:bg-[var(--surface-hover)]')}>
                {editingId === session.id ? (
                  <input
                    className="w-full min-w-0 rounded-[7px] border border-[var(--accent-primary)]/30 bg-[var(--surface-hover)] px-2 py-[5px] text-[12px] text-[var(--text-primary)] outline-none"
                    value={editingTitle}
                    autoFocus
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onBlur={() => { void commitRename(session) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void commitRename(session)
                      } else if (event.key === 'Escape') {
                        setEditingId(null)
                        setEditingTitle('')
                      }
                    }}
                  />
                ) : (
                  <>
                    <button
                      className={cx(
                        'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent py-[5px] pl-2 pr-0 text-left text-[12.5px] leading-5 transition-colors duration-150',
                        active ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      )}
                      onClick={() => onOpenSession(session.id)}
                      type="button"
                    >
                      <span className={cx('min-w-0 flex-1 truncate', isUntitledSessionTitle(session.title) && 'italic text-[var(--text-muted)]')}>
                        {session.title || UNTITLED_SESSION_TITLE}
                      </span>
                    </button>
                    <div className="sb-recent-menu-wrap relative flex size-5 shrink-0 items-center justify-center">
                      {isBusy && !menuOpen && (
                        <span className="size-[6px] animate-pulse rounded-full bg-[var(--accent-primary)] group-hover:hidden" title="Running" aria-label="Running" />
                      )}
                      <button
                        className={cx(
                          'absolute inset-0 flex cursor-pointer items-center justify-center border-0 bg-transparent text-[var(--text-muted)] opacity-0 transition duration-150 hover:text-[var(--text-primary)] group-hover:opacity-100',
                          menuOpen && 'text-[var(--text-primary)] opacity-100'
                        )}
                        type="button"
                        aria-label="Chat options"
                        onClick={(event) => {
                          event.stopPropagation()
                          setMenuSessionId((current) => (current === session.id ? null : session.id))
                        }}
                      >
                        <MoreOne size={12} />
                      </button>
                      {menuOpen && (
                        <div className="absolute right-0 top-[calc(100%+6px)] z-30 flex min-w-[156px] flex-col gap-0.5 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-menu)] p-1.5 shadow-[0_14px_28px_rgba(0,0,0,0.24)]">
                          <button className={cx(menuButtonClass, 'text-[var(--text-primary)]')} type="button" onClick={() => startRename(session.id, session.title)}>
                            <Edit size={12} />
                            <span>Rename</span>
                          </button>
                          <button className={cx(menuButtonClass, 'text-[var(--text-primary)]')} type="button" onClick={() => { void handleExport(session) }}>
                            <FileTextOne size={12} />
                            <span>Export as Markdown</span>
                          </button>
                          <button className={cx(menuButtonClass, 'text-[var(--text-primary)]')} type="button" onClick={() => { void handleShare(session) }}>
                            {copiedId === session.id ? <CheckOne size={12} className="text-app-success" /> : <Share size={12} />}
                            <span>{copiedId === session.id ? 'Copied' : 'Copy as Markdown'}</span>
                          </button>
                          <button className={cx(menuButtonClass, 'text-[var(--accent-danger)]')} type="button" onClick={() => { void handleDelete(session) }}>
                            <Delete size={12} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
          {sessions.length === 0 && (
            <div className="px-4 pb-2 pt-1 text-[10px] italic text-[var(--text-muted)]">No recent chats</div>
          )}
        </div>
      )}
    </div>
  )
}
