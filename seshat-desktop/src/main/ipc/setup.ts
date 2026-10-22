import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { completeSetup, getSetupPlan, isSetupCompleted, runSetup, type SetupProgress, type SetupSelection } from '../setup-manager'
import { assertTrustedSender } from './trusted-sender'

const PROGRESS_CHANNEL = 'setup:progress'

let running: Promise<void> | null = null

export function registerSetupHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('setup:state', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    return { completed: await isSetupCompleted() }
  })

  ipcMain.handle('setup:plan', (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    return getSetupPlan()
  })

  // Resolves when every chosen component is done or has failed; progress goes to the window that asked, as it happens.
  ipcMain.handle('setup:run', async (event: IpcMainInvokeEvent, selection: SetupSelection) => {
    assertTrustedSender(event)
    if (running) throw new Error('The setup is already running.')
    const report = (progress: SetupProgress) => {
      if (!event.sender.isDestroyed()) event.sender.send(PROGRESS_CHANNEL, progress)
    }
    running = runSetup(selection ?? {}, report).finally(() => {
      running = null
    })
    await running
  })

  ipcMain.handle('setup:complete', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    await completeSetup()
  })
}
