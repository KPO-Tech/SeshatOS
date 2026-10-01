import type { IpcMainInvokeEvent } from 'electron'

const allowedRendererURL = process.env.ELECTRON_RENDERER_URL?.replace(/\/$/, '')

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
  if (!senderURL.startsWith('file://')) {
    throw new Error(`Untrusted IPC sender: ${senderURL}`)
  }
}
