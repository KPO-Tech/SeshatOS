import { createWriteStream } from 'fs'
import { join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { assertTrustedSender } from './ipc/trusted-sender'

// Give the sidecar backend (see backend-process.ts) time to start before
// competing for network/CPU with an update check.
const INITIAL_CHECK_DELAY_MS = 10_000

let updateReadyToInstall = false

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/**
 * Wires electron-updater against the public seshat-releases feed (see
 * seshat-ui/package.json's build.publish) — seshat-ai itself stays private,
 * so this is the only repo the installed app polls, unauthenticated, no
 * token embedded anywhere.
 *
 * No-op in dev mode (unpackaged) — same guard as startBackendSidecar().
 * Downloads happen automatically in the background, but nothing is ever
 * installed without the user explicitly triggering it (via the renderer,
 * after 'update-downloaded'), so a restart never interrupts active work.
 */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    return
  }

  const logPath = join(app.getPath('logs'), 'auto-update.log')
  const logStream = createWriteStream(logPath, { flags: 'a' })
  const log = (line: string) => logStream.write(`[${new Date().toISOString()}] ${line}\n`)

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = {
    info: (message?: unknown) => log(`INFO ${String(message)}`),
    warn: (message?: unknown) => log(`WARN ${String(message)}`),
    error: (message?: unknown) => log(`ERROR ${String(message)}`),
  }

  autoUpdater.on('update-available', (info) => {
    log(`update available: ${info.version}`)
    broadcast('updates:available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    log('no update available')
    broadcast('updates:not-available', {})
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateReadyToInstall = true
    log(`update downloaded: ${info.version}`)
    broadcast('updates:downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log(`error: ${err.message}`)
    broadcast('updates:error', { message: err.message })
  })

  ipcMain.handle('updates:check-now', async (event) => {
    assertTrustedSender(event)
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('updates:quit-and-install', (event) => {
    assertTrustedSender(event)
    if (updateReadyToInstall) {
      autoUpdater.quitAndInstall()
    }
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => log(`initial check failed: ${err}`))
  }, INITIAL_CHECK_DELAY_MS)
}
