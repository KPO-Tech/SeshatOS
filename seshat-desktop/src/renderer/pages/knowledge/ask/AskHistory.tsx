import { useEffect, useMemo, useRef, useState } from 'react'
import { Delete, Plus } from '@icon-park/react'
import { deleteSession } from '@renderer/lib/deleteSession'
import { useSessionStore } from '@renderer/stores/session'
import { ago, askSessions } from './historyList'

type Props = {
  // The conversation now open, if one is.
  currentId: string | null
  onOpen: (id: string) => void
  onNew: () => void
  // A conversation was deleted; told so that the one open can be left.
  onDeleted: (id: string) => void
  onClose: () => void
}

// The history of the Ask view: its conversations only, to go on with one or delete it.
export function AskHistory({ currentId, onOpen, onNew, onDeleted, onClose }: Props) {
  const sessions = useSessionStore((state) => state.sessions)
  const list = useMemo(() => askSessions(sessions), [sessions])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      const target = event.target as Node
      // The icon that opens this menu toggles it itself.
      if (!root.current?.contains(target) && !(target as Element).closest?.('[aria-label="History of questions"]')) onClose()
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  async function remove(id: string) {
    setFailed(null)
    try {
      await deleteSession(id)
      setConfirming(null)
      onDeleted(id)
    } catch {
      setFailed(id)
    }
  }

  return (
    <div
      ref={root}
      role="dialog"
      aria-label="History of questions"
      className="absolute left-5 top-[60px] z-30 flex max-h-[min(460px,calc(100%-80px))] w-[360px] max-w-[calc(100%-40px)] flex-col overflow-hidden rounded-[14px] border border-solid border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_96%,var(--surface-root))] shadow-[0_18px_48px_rgba(0,0,0,0.35)]"
      style={{ animation: 'fade-in 140ms ease both' }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-0 border-b border-solid border-[var(--border-soft)] px-3.5 py-2.5">
        <h2 className="m-0 text-[13.5px] font-semibold text-[var(--text-primary)]">History</h2>
        <button
          type="button"
          onClick={() => {
            onNew()
            onClose()
          }}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-solid border-app-border-subtle bg-transparent px-2.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <Plus size={13} />
          New question
        </button>
      </div>

      {list.length === 0 ? (
        <p className="m-0 px-4 py-6 text-center text-[12.5px] text-[var(--text-muted)]">No question yet. What you ask here is kept here.</p>
      ) : (
        <ul className="no-scrollbar m-0 min-h-0 flex-1 list-none overflow-y-auto p-1.5">
          {list.map((session) => {
            const current = session.id === currentId
            return (
              <li key={session.id} className="group relative">
                {confirming === session.id ? (
                  <div className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-[12.5px]">
                    <span className="min-w-0 truncate text-[var(--text-secondary)]">{failed === session.id ? 'Could not delete it.' : 'Delete this conversation?'}</span>
                    <span className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => void remove(session.id)} className="cursor-pointer rounded-md border-0 bg-[var(--accent-danger)] px-2 py-1 text-[11.5px] font-semibold text-white">
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="cursor-pointer rounded-md border border-solid border-app-border-subtle bg-transparent px-2 py-1 text-[11.5px] text-[var(--text-secondary)]">
                        Keep
                      </button>
                    </span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onOpen(session.id)
                        onClose()
                      }}
                      className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-[10px] border-0 py-2 pl-2.5 pr-10 text-left transition-colors hover:bg-[var(--surface-hover)] ${current ? 'bg-[color-mix(in_srgb,var(--accent-primary)_11%,transparent)]' : 'bg-transparent'}`}
                    >
                      <span className={`truncate text-[13px] ${current ? 'font-semibold text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'}`}>{session.title}</span>
                      <span className="truncate text-[11.5px] text-[var(--text-muted)]">{[ago(session.updatedAt ?? session.createdAt), session.modelLabel ?? session.modelId].filter(Boolean).join(' · ')}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${session.title}`}
                      onClick={() => setConfirming(session.id)}
                      className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] opacity-0 transition hover:bg-[var(--surface-hover)] hover:text-[var(--accent-danger)] focus:opacity-100 group-hover:opacity-100"
                    >
                      <Delete size={14} />
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
