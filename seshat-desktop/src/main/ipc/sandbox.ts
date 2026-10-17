import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { app } from 'electron'
import { restartBackendSidecar } from '../backend-process'
import { enableSrt, srtStatus } from '../srt-manager'
import { assertTrustedSender } from './trusted-sender'

export function registerSandboxHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('sandbox:srt-status', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    return srtStatus()
  })

  // Windows one-time setup (one UAC prompt). Ready but NOT offered in the UI for now: the Windows backend of srt is
  // alpha, so users run the command themselves (see confinementView.ts) until it works reliably. The backend decides whether to use srt when it starts, so it is
  // restarted once the setup worked.
  ipcMain.handle('sandbox:srt-enable', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    const status = await enableSrt()
    if (status.state === 'ready' && app.isPackaged) {
      await restartBackendSidecar().catch(() => undefined)
    }
    return status
  })
}
