import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import {
  getWhisperStatus,
  downloadDefaultModels,
  downloadModel,
  activateModel,
  deleteModel,
  enableLocalWhisper,
  disableLocalWhisper,
  MODEL_CATALOG,
  type WhisperProgress,
  type WhisperModelId,
} from '../whisper-manager'
import { assertTrustedSender } from './trusted-sender'

const PROGRESS_CHANNEL = 'whisper:progress'

function forwardProgress(event: IpcMainInvokeEvent) {
  return (progress: WhisperProgress) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(PROGRESS_CHANNEL, progress)
    }
  }
}

export function registerWhisperHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('whisper:status', (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:models', (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    return MODEL_CATALOG
  })

  ipcMain.handle('whisper:download-defaults', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    await downloadDefaultModels(forwardProgress(event))
    await enableLocalWhisper()
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:download-model', async (event: IpcMainInvokeEvent, modelId: WhisperModelId) => {
    assertTrustedSender(event)
    await downloadModel(modelId, forwardProgress(event))
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:activate-model', async (event: IpcMainInvokeEvent, modelId: WhisperModelId) => {
    assertTrustedSender(event)
    await activateModel(modelId, forwardProgress(event))
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:delete-model', async (event: IpcMainInvokeEvent, modelId: WhisperModelId) => {
    assertTrustedSender(event)
    await deleteModel(modelId)
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:enable', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    await enableLocalWhisper()
    return getWhisperStatus()
  })

  ipcMain.handle('whisper:disable', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    await disableLocalWhisper()
    return getWhisperStatus()
  })
}
