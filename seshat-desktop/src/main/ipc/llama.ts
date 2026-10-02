import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import {
  activateModel,
  addCustomModel,
  deleteModel,
  disableLlama,
  downloadModel,
  enableLlama,
  getLlamaStatus,
  provisionDefaults,
  type LlamaProgress,
} from '../llama-manager'
import { assertTrustedSender } from './trusted-sender'

const PROGRESS_CHANNEL = 'llama:progress'

export function broadcastLlamaProgress(progress: LlamaProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(PROGRESS_CHANNEL, progress)
  }
}

export function registerLlamaHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('llama:status', (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    return getLlamaStatus()
  })

  ipcMain.handle('llama:provision', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    await provisionDefaults(broadcastLlamaProgress)
    return getLlamaStatus()
  })

  ipcMain.handle('llama:download-model', async (event: IpcMainInvokeEvent, modelId: string) => {
    assertTrustedSender(event)
    await downloadModel(modelId, broadcastLlamaProgress)
    return getLlamaStatus()
  })

  ipcMain.handle('llama:add-custom-model', async (event: IpcMainInvokeEvent, repo: string, filename: string) => {
    assertTrustedSender(event)
    await addCustomModel(repo, filename)
    return getLlamaStatus()
  })

  ipcMain.handle('llama:activate-model', async (event: IpcMainInvokeEvent, modelId: string) => {
    assertTrustedSender(event)
    await activateModel(modelId, broadcastLlamaProgress)
    return getLlamaStatus()
  })

  ipcMain.handle('llama:delete-model', async (event: IpcMainInvokeEvent, modelId: string) => {
    assertTrustedSender(event)
    await deleteModel(modelId)
    return getLlamaStatus()
  })

  ipcMain.handle('llama:enable', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    await provisionDefaults(broadcastLlamaProgress)
    await enableLlama()
    return getLlamaStatus()
  })

  ipcMain.handle('llama:disable', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    await disableLlama()
    return getLlamaStatus()
  })
}
