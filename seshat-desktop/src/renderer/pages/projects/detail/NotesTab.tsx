import { useEffect, useRef, useState } from 'react'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import { deleteNote, listNotes, noteTitle, saveNote, type ProjectNote } from '@renderer/lib/projectNotes'
import { relativeTime } from '@renderer/lib/projectsView'
import { Delete, Plus } from '../icons'

type Props = {
  projectId: string
  now: number
}

const SAVE_DELAY_MS = 600

/**
 * The notes of a project: a list on the left and the one being written on the right, in Markdown. A note is kept a moment after the last
 * key, and when the person leaves it, so that nothing has to be saved by hand.
 */
export function NotesTab({ projectId, now }: Props) {
  const [notes, setNotes] = useState<ProjectNote[]>(() => listNotes(projectId))
  const [selectedId, setSelectedId] = useState<string | null>(() => listNotes(projectId)[0]?.id ?? null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // The note of the editor, when it has been kept: its id is what a later save changes.
  const editing = useRef<string | null>(null)
  const timer = useRef<number | null>(null)
  const latest = useRef({ title: '', body: '' })
  const dirty = useRef(false)

  function flush() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (!dirty.current) return
    dirty.current = false
    if (!editing.current && !latest.current.title.trim() && !latest.current.body.trim()) return
    const kept = saveNote(projectId, { id: editing.current ?? undefined, ...latest.current })
    editing.current = kept.id
    setNotes(listNotes(projectId))
    setSelectedId(kept.id)
  }

  function open(note: ProjectNote | null) {
    flush()
    editing.current = note?.id ?? null
    latest.current = { title: note?.title ?? '', body: note?.body ?? '' }
    setSelectedId(note?.id ?? null)
    setTitle(note?.title ?? '')
    setBody(note?.body ?? '')
    setPreview(false)
    setConfirming(false)
  }

  // The first note is open when the tab is; what is typed is kept when the tab is left.
  useEffect(() => {
    open(listNotes(projectId)[0] ?? null)
    return () => flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function change(next: { title?: string; body?: string }) {
    latest.current = { ...latest.current, ...next }
    dirty.current = true
    if (next.title !== undefined) setTitle(next.title)
    if (next.body !== undefined) setBody(next.body)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
  }

  function remove() {
    const id = editing.current
    dirty.current = false
    if (id) deleteNote(projectId, id)
    const rest = listNotes(projectId)
    setNotes(rest)
    editing.current = null
    open(rest[0] ?? null)
  }

  const fresh = selectedId === null && editing.current === null

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex w-[250px] shrink-0 flex-col border-r border-[var(--border-soft)]">
        <div className="flex shrink-0 items-center justify-between px-3 py-3">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">Notes</span>
          <button type="button" onClick={() => open(null)} aria-label="New note" title="New note" className="flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            <Plus size={14} />
          </button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {notes.length === 0 && <p className="m-0 px-2 py-2 text-[12px] text-[var(--text-muted)]">No notes yet. Write the first one on the right.</p>}
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => open(note)}
              className={`flex w-full cursor-pointer flex-col rounded-md border-0 px-2.5 py-1.5 text-left ${note.id === selectedId ? 'bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)]' : 'bg-transparent hover:bg-[var(--surface-hover)]'}`}
            >
              <span className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">{noteTitle(note)}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{relativeTime(note.updatedAt, now) || 'just now'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-soft)] px-4 py-2">
          <input
            value={title}
            onChange={(event) => change({ title: event.target.value })}
            onBlur={flush}
            placeholder="Title"
            aria-label="Title of the note"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <div className="flex rounded-lg border border-[var(--border-soft)] p-0.5 text-[11.5px]" role="group" aria-label="View">
            {([false, true] as const).map((value) => (
              <button key={String(value)} type="button" aria-pressed={preview === value} onClick={() => setPreview(value)} className={`cursor-pointer rounded-md border-0 px-2 py-0.5 ${preview === value ? 'bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
                {value ? 'Preview' : 'Write'}
              </button>
            ))}
          </div>
          {editing.current && (confirming ? (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setConfirming(false)} className="cursor-pointer rounded-md border border-[var(--border-soft)] bg-transparent px-2 py-0.5 text-[11.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                Cancel
              </button>
              <button type="button" onClick={remove} className="cursor-pointer rounded-md border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 px-2 py-0.5 text-[11.5px] font-semibold text-[var(--accent-danger)]">
                Delete
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} aria-label="Delete the note" title="Delete the note" className="flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-danger)]">
              <Delete size={13} />
            </button>
          ))}
        </div>
        {preview ? (
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">{body.trim() ? <MarkdownView variant="document">{body}</MarkdownView> : <p className="m-0 text-[13px] text-[var(--text-muted)]">Nothing to show yet.</p>}</div>
        ) : (
          <textarea
            value={body}
            onChange={(event) => change({ body: event.target.value })}
            onBlur={flush}
            placeholder={fresh ? 'Write a note in Markdown: what the project is for, decisions, things to remember...' : 'Write in Markdown...'}
            aria-label="Text of the note"
            className="no-scrollbar min-h-0 flex-1 resize-none border-0 bg-transparent px-6 py-4 font-mono text-[13px] leading-[1.6] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        )}
      </div>
    </div>
  )
}
