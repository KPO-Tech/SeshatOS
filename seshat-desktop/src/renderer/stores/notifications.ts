import { create } from 'zustand'
import { decide, getLog, getPrefs, LOG_LIMIT, playChime, saveLog, type AppNotification, type NotificationKind } from '@renderer/lib/notifications'

type NotificationsState = {
  items: AppNotification[]
  add: (notice: Omit<AppNotification, 'id' | 'at' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  remove: (id: string) => void
  clear: () => void
}

let counter = 0
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`

export const useNotificationsStore = create<NotificationsState>()((set, get) => {
  const keep = (items: AppNotification[]) => {
    const next = items.slice(0, LOG_LIMIT)
    saveLog(next)
    set({ items: next })
  }
  return {
    items: getLog(),
    add: (notice) => keep([{ ...notice, id: newId(), at: Date.now(), read: false }, ...get().items]),
    markRead: (id) => keep(get().items.map((item) => (item.id === id ? { ...item, read: true } : item))),
    markAllRead: () => keep(get().items.map((item) => ({ ...item, read: true }))),
    remove: (id) => keep(get().items.filter((item) => item.id !== id)),
    clear: () => keep([])
  }
})

export const selectUnread = (state: NotificationsState) => state.items.filter((item) => !item.read).length

/**
 * Tells the person about something, as their choices say: it goes to the bell, the system shows it when the window is not in front, and a
 * chime plays. A kind they turned off is not told at all.
 */
export function notify(kind: NotificationKind, notice: { title: string; body?: string; route?: string }) {
  const action = decide(kind, getPrefs(), document.hasFocus())
  if (!action.record) return
  useNotificationsStore.getState().add({ kind, ...notice })
  if (action.desktop) void window.seshat?.notify?.show(notice)
  if (action.sound) playChime()
}
