import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from '@icon-park/react'
import { WindowCloseIcon } from '@renderer/components/ui/WindowControlIcon'
import { deleteSession } from '@renderer/lib/deleteSession'
import { isUntitledSessionTitle, UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { useOverlayStore } from '@renderer/stores/overlay'
import type { ChatSession } from '@renderer/stores/session'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type Props = {
  open: boolean
  sessions: ChatSession[]
  scopeLabel: string
  onClose: () => void
  onOpenSession: (id: string) => void
  onDeleted: (ids: string[]) => void
}

type Group = { label: string; sessions: ChatSession[] }

function sessionTime(session: ChatSession): number {
  return new Date(session.updatedAt || session.createdAt).getTime()
}

function groupLabel(time: number, now: number): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  const day = 86_400_000
  if (time >= startOfToday) return 'Today'
  if (time >= startOfToday - day) return 'Yesterday'
  if (time >= startOfToday - 7 * day) return 'Previous 7 days'
  if (time >= startOfToday - 30 * day) return 'Previous 30 days'
  return 'Older'
}

function groupSessions(sessions: ChatSession[]): Group[] {
  const now = Date.now()
  const groups: Group[] = []
  for (const session of sessions) {
    const label = groupLabel(sessionTime(session), now)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.sessions.push(session)
    else groups.push({ label, sessions: [session] })
  }
  return groups
}

function formatTime(session: ChatSession): string {
  const date = new Date(sessionTime(session))
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function SessionHistoryModal({ open, sessions, scopeLabel, onClose, onOpenSession, onDeleted }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(new Set())
    setConfirming(false)
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  useEffect(() => {
    if (!open) return
    useOverlayStore.getState().setModalOpen(true)
    return () => useOverlayStore.getState().setModalOpen(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (confirming) setConfirming(false)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, confirming, onClose])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return [...sessions]
      .filter((session) => !needle || (session.title || UNTITLED_SESSION_TITLE).toLowerCase().includes(needle))
      .sort((a, b) => sessionTime(b) - sessionTime(a))
  }, [sessions, query])
  const groups = useMemo(() => groupSessions(filtered), [filtered])

  if (!open) return null

  const allSelected = filtered.length > 0 && filtered.every((session) => selected.has(session.id))

  function toggle(id: string) {
    setConfirming(false)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setConfirming(false)
    setSelected(allSelected ? new Set() : new Set(filtered.map((session) => session.id)))
  }

  async function deleteSelected() {
    setDeleting(true)
    const ids = [...selected]
    const results = await Promise.all(ids.map((id) => deleteSession(id).then(() => id).catch(() => null)))
    const deleted = results.filter((id): id is string => id !== null)
    setDeleting(false)
    setConfirming(false)
    setSelected(new Set(ids.filter((id) => !deleted.includes(id))))
    if (deleted.length > 0) onDeleted(deleted)
  }

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-start justify-center bg-black/45 pt-[10vh] backdrop-blur-[3px]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        className="flex max-h-[76vh] w-full max-w-[620px] animate-[fade-in_0.15s_ease-out] flex-col overflow-hidden rounded-app-xl border border-app-border bg-app-bg shadow-[0_24px_64px_rgba(0,0,0,0.32)]"
        role="dialog"
        aria-modal="true"
        aria-label="Conversation history"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-app-border-subtle px-3 py-2.5">
          <Search size={15} className="shrink-0 text-app-text-muted" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 border-0 bg-transparent font-app-sans text-[var(--font-size-md)] font-medium text-app-text outline-none placeholder:text-app-text-muted"
            placeholder={`Filter ${scopeLabel} conversations...`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="flex shrink-0 cursor-pointer items-center rounded-[5px] border border-app-border bg-app-surface px-1.5 py-[3px] text-app-text-muted hover:bg-[var(--surface-hover)]"
            onClick={onClose}
            tabIndex={-1}
            type="button"
            aria-label="Close history"
          >
            <WindowCloseIcon />
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-app-border-subtle px-3 py-2 text-[12px]">
          <label className="flex cursor-pointer items-center gap-2 text-app-text-secondary">
            <input type="checkbox" className="size-3.5 cursor-pointer accent-[var(--accent-primary)]" checked={allSelected} onChange={toggleAll} disabled={filtered.length === 0} />
            <span>{selected.size > 0 ? `${selected.size} selected` : `${filtered.length} conversation${filtered.length === 1 ? '' : 's'}`}</span>
          </label>
          {selected.size > 0 && (
            confirming ? (
              <div className="flex items-center gap-2">
                <span className="text-app-text-muted">Delete {selected.size}? This cannot be undone.</span>
                <button className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-app-text-secondary hover:bg-[var(--surface-hover)]" type="button" onClick={() => setConfirming(false)} disabled={deleting}>Cancel</button>
                <button className="cursor-pointer rounded-md border-0 bg-[var(--accent-danger)] px-2.5 py-1 font-semibold text-white disabled:opacity-60" type="button" onClick={() => void deleteSelected()} disabled={deleting}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-app-text-secondary hover:bg-[var(--surface-hover)]" type="button" onClick={() => setSelected(new Set())}>Clear</button>
                <button className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 font-semibold text-[var(--accent-danger)] hover:bg-[var(--surface-hover)]" type="button" onClick={() => setConfirming(true)}>Delete</button>
              </div>
            )
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-[var(--font-size-2xs)] text-app-text-muted">
              {query.trim() ? 'No conversations found' : 'No conversations yet'}
            </div>
          ) : groups.map((group) => (
            <div key={group.label} className="mb-1.5">
              <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.05em] text-app-text-muted">{group.label}</div>
              {group.sessions.map((session) => {
                const checked = selected.has(session.id)
                return (
                  <div key={session.id} className={cx('group flex items-center gap-2 rounded-app-md px-2 hover:bg-app-surface', checked && 'bg-app-surface')}>
                    <input type="checkbox" className="size-3.5 shrink-0 cursor-pointer accent-[var(--accent-primary)]" checked={checked} onChange={() => toggle(session.id)} aria-label={`Select ${session.title || UNTITLED_SESSION_TITLE}`} />
                    <button
                      className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 border-0 bg-transparent py-[7px] text-left"
                      type="button"
                      onClick={() => { onOpenSession(session.id); onClose() }}
                    >
                      <span className={cx('min-w-0 flex-1 truncate text-[var(--font-size-sm)]', isUntitledSessionTitle(session.title) ? 'italic text-app-text-muted' : 'text-app-text')}>
                        {session.title || UNTITLED_SESSION_TITLE}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-[10px] text-app-text-muted">{formatTime(session)}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
