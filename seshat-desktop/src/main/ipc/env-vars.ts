import { app } from 'electron'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { ENV_VAR_CATALOG, listEnvVarStatus, setEnvVar, deleteEnvVar } from '../env-vars-manager'
import { restartBackendSidecar } from '../backend-process'
import { assertTrustedSender } from './trusted-sender'
import { assertString } from './validation'

function assertKnownEnvKey(value: unknown): string {
  const key = assertString(value, 'Environment variable key')
  if (!ENV_VAR_CATALOG.some((def) => def.key === key)) {
    throw new Error(`Unknown environment variable: ${key}`)
  }
  return key
}

export function registerEnvVarsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('env-vars:catalog', (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    return ENV_VAR_CATALOG
  })

  ipcMain.handle('env-vars:status', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    return listEnvVarStatus()
  })

  ipcMain.handle('env-vars:set', async (event: IpcMainInvokeEvent, key: unknown, value: unknown) => {
    assertTrustedSender(event)
    const safeKey = assertKnownEnvKey(key)
    if (typeof value !== 'string') {
      throw new Error('Environment variable value must be a string')
    }
    await setEnvVar(safeKey, value)
  })

  ipcMain.handle('env-vars:delete', async (event: IpcMainInvokeEvent, key: unknown) => {
    assertTrustedSender(event)
    const safeKey = assertKnownEnvKey(key)
    await deleteEnvVar(safeKey)
  })

  ipcMain.handle('env-vars:restart-backend', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    if (!app.isPackaged) {
      return { ok: false, error: 'Not applicable in dev mode - you run seshat-backend yourself, restart it in your own terminal to pick up new values.' }
    }
    try {
      await restartBackendSidecar()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
