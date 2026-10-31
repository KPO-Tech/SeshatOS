import type { IpcMain } from 'electron'
import { readdir, readFile, stat } from 'fs/promises'
import { assertTrustedSender } from './trusted-sender'
import { assertLocalFilePath } from './validation'
import { extname } from 'node:path'
import { countFiles, type FileCount } from './fileCount'
import { openInVSCode } from './editor'
import { scanProject, searchFiles, type FoundFile, type ProjectScan } from './projectScan'

// Backs the Files panel's tree - real filesystem browsing of a project
// folder, same trust level as project:path-exists/project:has-context-file
// (an arbitrary local path the user picked via the folder dialog, not
// backend-controlled data), so assertLocalFilePath is the right check here,
// not assertPathWithinRuntimeRoot (that one is for backend-supplied paths).

const MAX_READ_TEXT_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp'
}

type DirEntry = {
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

  // The number on a project's card: bounded (see countFiles), so a folder as big as a disk answers at once.
  ipcMain.handle('fs:count-files', async (event, directoryPath: string): Promise<FileCount> => {
    assertTrustedSender(event)
    return countFiles(assertLocalFilePath(directoryPath, 'Directory'))
  })

  // What the page of a project says about its folder, and the search of its tree: bounded, like the count of a card.
  ipcMain.handle('fs:scan-project', async (event, directoryPath: string): Promise<ProjectScan> => {
    assertTrustedSender(event)
    return scanProject(assertLocalFilePath(directoryPath, 'Directory'))
  })

  ipcMain.handle('fs:search-files', async (event, directoryPath: string, query: string): Promise<FoundFile[]> => {
    assertTrustedSender(event)
    if (typeof query !== 'string' || query.length > 200) throw new Error('Query is too long')
    return searchFiles(assertLocalFilePath(directoryPath, 'Directory'), query)
  })

  // A picture of the project, to look at: images only, and not a very big one.
  ipcMain.handle('fs:read-image', async (event, filePath: string): Promise<string> => {
    assertTrustedSender(event)
    const safePath = assertLocalFilePath(filePath, 'File path')
    const mime = IMAGE_TYPES[extname(safePath).toLowerCase()]
    if (!mime) throw new Error('Not a picture this view can show')
    const info = await stat(safePath)
    if (!info.isFile()) throw new Error('Path does not point to a file')
    if (info.size > MAX_IMAGE_BYTES) throw new Error('Picture is too large to preview')
    return `data:${mime};base64,${(await readFile(safePath)).toString('base64')}`
  })

  ipcMain.handle('project:open-in-editor', async (event, directoryPath: string): Promise<boolean> => {
    assertTrustedSender(event)
    const safePath = assertLocalFilePath(directoryPath, 'Directory')
    if (!(await stat(safePath)).isDirectory()) throw new Error('Path does not point to a folder')
    return openInVSCode(safePath)
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
