import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { isAppNavigation } from '../url-safety'

const allowedRendererURL = process.env.ELECTRON_RENDERER_URL?.replace(/\/$/, '')
// The packaged renderer: the one file the window loads (see index.ts). Any other local page, even one that reached the window, is refused.
const rendererFileURL = pathToFileURL(join(__dirname, '../renderer/index.html')).href

// Every ipcMain.handle callback should call this first. Without it, any
// frame the main process ever loads (a devtools popup, a future webview,
// a compromised renderer) could invoke privileged channels - HTTP calls
// with the stored auth token, secret-store access, shell.openPath - just
// by having a reference to the same preload-exposed bridge.
export function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderURL = (event.senderFrame?.url ?? '').replace(/\/$/, '')
  if (!senderURL) {
    throw new Error('Missing IPC sender URL')
  }
  if (allowedRendererURL) {
    if (senderURL === allowedRendererURL || senderURL.startsWith(`${allowedRendererURL}/`)) {
      return
    }
    throw new Error(`Untrusted IPC sender: ${senderURL}`)
  }
  if (!isAppNavigation(senderURL, rendererFileURL)) {
    throw new Error(`Untrusted IPC sender: ${senderURL}`)
  }
}
