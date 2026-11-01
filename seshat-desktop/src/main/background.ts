import { app, BrowserWindow, Menu, Notification, Tray, dialog, nativeImage, type IpcMain } from 'electron'

// A task of the backend (an installation, a download) goes on while the person does something else, and it should survive the window being
// closed: closing a window that has work in progress hides it, and an icon near the clock brings it back or quits.

/** Whether closing the window should hide it: work is in progress, the app is not already quitting, and the platform keeps apps in a tray. */
export function shouldKeepRunning(state: { busy: number; quitting: boolean; platform: NodeJS.Platform }): boolean {
  return state.busy > 0 && !state.quitting && state.platform !== 'darwin'
}

/** What the person is told when the window is hidden. */
export function keepRunningMessage(busy: number): { title: string; body: string } {
  const what = busy === 1 ? '1 task is still running' : `${busy} tasks are still running`
  return { title: 'SeshatOS is still working', body: `${what}. Open SeshatOS from the icon near the clock, or quit it from there.` }
}

const MAX_TITLE = 120
const MAX_BODY = 300

type NoticePayload = { title?: unknown; body?: unknown; route?: unknown }

/** Keeps only what a system notification may show: short texts, and a route that stays inside the app. */
export function cleanNotice(payload: NoticePayload): { title: string; body: string; route: string } | null {
  if (typeof payload?.title !== 'string' || payload.title.trim() === '') return null
  const body = typeof payload.body === 'string' ? payload.body : ''
  const route = typeof payload.route === 'string' && payload.route.startsWith('/') && !payload.route.startsWith('//') ? payload.route.slice(0, 200) : ''
  return { title: payload.title.trim().slice(0, MAX_TITLE), body: body.trim().slice(0, MAX_BODY), route }
}

type Deps = {
  getWindow: () => BrowserWindow | null
  iconPath: () => string
}

export function createBackground({ getWindow, iconPath }: Deps) {
  let busy = 0
  let quitting = false
  let tray: Tray | null = null

  function showWindow() {
    const win = getWindow()
    destroyTray()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  function destroyTray() {
    tray?.destroy()
    tray = null
  }

  async function quitFromTray() {
    if (busy > 0) {
      const answer = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Keep running', 'Quit'],
        defaultId: 0,
        cancelId: 0,
        message: busy === 1 ? 'A task is still running' : `${busy} tasks are still running`,
        detail: 'Quitting stops them.'
      })
      if (answer.response !== 1) return
    }
    quitting = true
    app.quit()
  }

  function ensureTray() {
    if (tray) return
    const icon = nativeImage.createFromPath(iconPath())
    tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }))
    tray.setToolTip('SeshatOS')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open SeshatOS', click: showWindow },
        { type: 'separator' },
        { label: 'Quit', click: () => void quitFromTray() }
      ])
    )
    tray.on('click', showWindow)
  }

  function notify(payload: NoticePayload) {
    const notice = cleanNotice(payload)
    if (!notice || !Notification.isSupported()) return
    const shown = new Notification({ title: notice.title, body: notice.body, icon: iconPath() })
    shown.on('click', () => {
      showWindow()
      if (notice.route) getWindow()?.webContents.send('notify:open', notice.route)
    })
    shown.show()
  }

  return {
    /** Called when the window is about to close: hides it, and keeps the app alive in the tray, when work is in progress. */
    onWindowClose(event: { preventDefault: () => void }, win: BrowserWindow) {
      if (!shouldKeepRunning({ busy, quitting, platform: process.platform })) return
      event.preventDefault()
      win.hide()
      ensureTray()
      notify(keepRunningMessage(busy))
    },
    markQuitting() {
      quitting = true
      destroyTray()
    },
    register(ipcMain: IpcMain) {
      ipcMain.handle('background:set-busy', (event, count: unknown) => {
        busy = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
        // A hidden window gets its timers slowed down, which would delay the end of a task being noticed: not while work is in progress.
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.webContents.setBackgroundThrottling(busy === 0)
      })
      ipcMain.handle('notify:show', (_event, payload: NoticePayload) => notify(payload))
    }
  }
}
