import type { IpcMain } from 'electron'
import { readdir, readFile, stat } from 'fs/promises'
import { assertTrustedSender } from './trusted-sender'
import { assertLocalFilePath } from './validation'

// Backs the Files panel's tree - real filesystem browsing of a project
// folder, same trust level as project:path-exists/project:has-context-file
// (an arbitrary local path the user picked via the folder dialog, not
// backend-controlled data), so assertLocalFilePath is the right check here,
// not assertPathWithinRuntimeRoot (that one is for backend-supplied paths).

const MAX_READ_TEXT_BYTES = 2 * 1024 * 1024

export type DirEntry = {
  name: string
  isDirectory: boolean
}

export function registerFilesystemHandlers(ipcMain: IpcMain) {
  ipcMain.handle('fs:list-directory', async (event, directoryPath: string): Promise<DirEntry[]> => {
    assertTrustedSender(event)
    const safePath = assertLocalFilePath(directoryPath, 'Directory')
    const entries = await readdir(safePath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      })
  })

  ipcMain.handle('fs:read-text-file', async (event, filePath: string): Promise<string> => {
    assertTrustedSender(event)
    const safePath = assertLocalFilePath(filePath, 'File path')
    const info = await stat(safePath)
    if (!info.isFile()) throw new Error('Path does not point to a file')
    if (info.size > MAX_READ_TEXT_BYTES) throw new Error('File is too large to preview')
    const buffer = await readFile(safePath)
    // Cheap binary heuristic - a null byte in the first chunk is not valid
    // UTF-8 text, and decoding a real binary file as text would just show
    // garbage instead of a clear "can't preview this" message.
    if (buffer.subarray(0, 8000).includes(0)) throw new Error('File does not look like text')
    return buffer.toString('utf-8')
  })
}
