import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { CheckOne, CloseOne, Remind, Up } from '@icon-park/react'
import { ago, type AppNotification } from '@renderer/lib/notifications'
import { selectUnread, useNotificationsStore } from '@renderer/stores/notifications'

const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties & { WebkitAppRegion: string }

function KindIcon({ kind }: { kind: AppNotification['kind'] }) {
  if (kind === 'error') return <span className="text-[var(--accent-danger)]"><CloseOne theme="filled" size={15} fill="currentColor" /></span>
  if (kind === 'update') return <span className="text-[var(--accent-primary)]"><Up theme="filled" size={15} fill="currentColor" /></span>
  return <span className="text-[var(--accent-success)]"><CheckOne theme="filled" size={15} fill="currentColor" /></span>
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

/** The bell of the title bar: what the app told the person while they were elsewhere, kept until they clear it. */
export function NotificationBell() {
  const items = useNotificationsStore((state) => state.items)
  const unread = useNotificationsStore(selectUnread)
  const { markRead, markAllRead, remove, clear } = useNotificationsStore.getState()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const now = useNow(open)

  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function openItem(item: AppNotification) {
    markRead(item.id)
    if (item.route) navigate(item.route)
    setOpen(false)
  }

  return (
    <div ref={root} className="relative" style={noDragStyle}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-[var(--text-muted)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
      >
        <Remind theme="outline" size={15} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex min-w-[14px] items-center justify-center rounded-full bg-[var(--accent-primary)] px-[3px] text-[9px] font-semibold leading-[14px] text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-[34px] z-[60] flex max-h-[420px] w-[340px] flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] px-3.5 py-2.5">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Notifications</span>
            <div className="flex items-center gap-3 text-[11.5px]">
              <button type="button" disabled={unread === 0} onClick={markAllRead} className="cursor-pointer border-0 bg-transparent p-0 text-[var(--accent-primary)] disabled:cursor-default disabled:text-[var(--text-faint)]">
                Mark all as read
              </button>
              <button type="button" disabled={items.length === 0} onClick={clear} className="cursor-pointer border-0 bg-transparent p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:text-[var(--text-faint)]">
                Clear
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="m-0 px-4 py-8 text-center text-[12.5px] leading-5 text-[var(--text-muted)]">Nothing yet. What finishes in the background, and what goes wrong, is kept here.</p>
          ) : (
            <ul className="m-0 min-h-0 list-none overflow-y-auto p-1.5">
              {items.map((item) => (
                <li key={item.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--surface-hover)]"
                  >
                    <span className="mt-0.5 shrink-0">
                      <KindIcon kind={item.kind} />
                    </span>
                    <span className="min-w-0 flex-1 pr-5">
                      <span className={`block truncate text-[12.5px] text-[var(--text-primary)] ${item.read ? 'font-normal' : 'font-semibold'}`}>{item.title}</span>
                      {item.body && <span className="line-clamp-2 block text-[11.5px] leading-[1.4] text-[var(--text-muted)]">{item.body}</span>}
                      <span className="mt-0.5 block text-[10.5px] text-[var(--text-faint)]">{ago(item.at, now)}</span>
                    </span>
                    {!item.read && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent-primary)]" aria-label="Unread" />}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => remove(item.id)}
                    className="absolute right-2 top-2 hidden size-5 cursor-pointer items-center justify-center rounded-md border-0 bg-[var(--surface-panel)] p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] group-hover:flex"
                  >
                    <CloseOne theme="outline" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
