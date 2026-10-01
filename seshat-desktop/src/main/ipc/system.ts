import type { IpcMain } from 'electron'
import { app, dialog, shell, BrowserWindow } from 'electron'
import { stat, readFile, writeFile } from 'fs/promises'
import { spawn } from 'child_process'
import { extname, join } from 'path'
import { assertTrustedSender } from './trusted-sender'
import { isExternalOpenAllowed } from '../url-safety'
import { assertLocalFilePath, assertPathWithinRuntimeRoot, sanitizeSaveFileInput } from './validation'

// Mirrors the seshat engine's own candidateInstructionFiles (seshat SDK,
// internal/engine/project_instructions.go) exactly, in the same order - the
// engine re-reads these fresh on every turn and uses the first non-empty
// one, so this check must agree with it or the banner (Home.tsx) could
// claim a project has no context file when the engine would actually find
// one, or vice versa.
const PROJECT_CONTEXT_CANDIDATE_FILES = ['SESHAT.md', 'AGENTS.md', join('.seshat', 'instructions.md')]

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

type TerminalSession = {
  id: string
  process: ReturnType<typeof spawn>
}

const terminalSessions = new Map<string, TerminalSession>()

function resolveShellCommand() {
  if (process.platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-NoExit'],
      label: 'PowerShell',
    }
  }
  return {
    command: process.env.SHELL || '/bin/bash',
    args: ['-i'],
    label: process.env.SHELL?.split('/').pop() || 'bash',
  }
}

function sendTerminalEvent(id: string, event: Electron.IpcMainInvokeEvent, payload: Record<string, unknown>) {
  if (event.sender.isDestroyed()) return
  event.sender.send('terminal:event', { id, ...payload })
}

export function registerSystemHandlers(ipcMain: IpcMain) {
  ipcMain.handle('app:version', (event) => {
    assertTrustedSender(event)
    return app.getVersion()
  })

  ipcMain.handle('system:open-path', (event, filePath: string) => {
    assertTrustedSender(event)
    return shell.openPath(assertPathWithinRuntimeRoot(filePath))
  })

  ipcMain.handle('system:open-local-path', async (event, filePath: string) => {
    assertTrustedSender(event)
    const safePath = assertLocalFilePath(filePath)
    const result = await shell.openPath(safePath)
    if (result) throw new Error(result)
  })

  ipcMain.handle('system:open-terminal', async (event, directory: string) => {
    assertTrustedSender(event)
    const safeDirectory = assertLocalFilePath(directory, 'Directory')
    const info = await stat(safeDirectory)
    if (!info.isDirectory()) throw new Error('Directory must point to a folder')

    if (process.platform === 'win32') {
      const wt = spawn('wt.exe', ['-d', safeDirectory, 'powershell.exe'], { detached: true, stdio: 'ignore' })
      wt.on('error', () => {
        spawn('powershell.exe', ['-NoExit', '-Command', `Set-Location -LiteralPath '${safeDirectory.replace(/'/g, "''")}'`], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        }).unref()
      })
      wt.unref()
      return
    }

    if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', safeDirectory], { detached: true, stdio: 'ignore' }).unref()
      return
    }

    spawn('x-terminal-emulator', ['--working-directory', safeDirectory], { detached: true, stdio: 'ignore' }).unref()
  })

  ipcMain.handle('terminal:start', async (event, payload: { id: string; cwd: string }) => {
    assertTrustedSender(event)
    const id = String(payload?.id || '').trim()
    if (!id) throw new Error('Terminal id is required')
    const safeDirectory = assertLocalFilePath(payload.cwd, 'Directory')
    const info = await stat(safeDirectory)
    if (!info.isDirectory()) throw new Error('Directory must point to a folder')

    const existing = terminalSessions.get(id)
    if (existing) {
      existing.process.kill()
      terminalSessions.delete(id)
    }

    const shell = resolveShellCommand()
    const child = spawn(shell.command, shell.args, {
      cwd: safeDirectory,
      env: process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    terminalSessions.set(id, { id, process: child })

    sendTerminalEvent(id, event, {
      type: 'started',
      shell: shell.label,
      cwd: safeDirectory,
      pid: child.pid,
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      sendTerminalEvent(id, event, { type: 'data', stream: 'stdout', data: chunk.toString('utf-8') })
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      sendTerminalEvent(id, event, { type: 'data', stream: 'stderr', data: chunk.toString('utf-8') })
    })
    child.on('error', (error) => {
      sendTerminalEvent(id, event, { type: 'error', message: error.message })
    })
    child.on('exit', (code, signal) => {
      if (terminalSessions.get(id)?.process !== child) return
      terminalSessions.delete(id)
      sendTerminalEvent(id, event, { type: 'exit', code, signal })
    })
    return { ok: true, id, shell: shell.label, cwd: safeDirectory, pid: child.pid }
  })

  ipcMain.handle('terminal:write', (event, payload: { id: string; data: string }) => {
    assertTrustedSender(event)
    const session = terminalSessions.get(String(payload?.id || ''))
    if (!session || session.process.killed) throw new Error('Terminal session is not running')
    session.process.stdin?.write(String(payload?.data ?? ''))
  })

  ipcMain.handle('terminal:stop', (event, id: string) => {
    assertTrustedSender(event)
    const session = terminalSessions.get(String(id || ''))
    if (!session) return
    if (terminalSessions.get(session.id)?.process === session.process) {
      terminalSessions.delete(session.id)
    }
    session.process.kill()
  })

  ipcMain.handle('system:show-file', (event, filePath: string) => {
    assertTrustedSender(event)
    shell.showItemInFolder(assertPathWithinRuntimeRoot(filePath))
  })

  ipcMain.handle('system:read-file-data-url', async (event, filePath: string) => {
    assertTrustedSender(event)
    const safePath = assertPathWithinRuntimeRoot(filePath)
    const mimeType = IMAGE_MIME_BY_EXT[extname(safePath).toLowerCase()]
    if (!mimeType) throw new Error('Unsupported preview file type')
    const buffer = await readFile(safePath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  })

  ipcMain.handle('project:has-context-file', async (event, projectPath: string) => {
    assertTrustedSender(event)
    const safeProjectPath = assertLocalFilePath(projectPath, 'Project path')
    for (const name of PROJECT_CONTEXT_CANDIDATE_FILES) {
      try {
        const content = await readFile(join(safeProjectPath, name), 'utf-8')
        if (content.trim() !== '') return true
      } catch {
        // Missing/unreadable - try the next candidate, same as the engine.
      }
    }
    return false
  })

  ipcMain.handle('project:path-exists', async (event, projectPath: string) => {
    assertTrustedSender(event)
    const safeProjectPath = assertLocalFilePath(projectPath, 'Project path')
    try {
      const info = await stat(safeProjectPath)
      return info.isDirectory()
    } catch {
      return false
    }
  })

  ipcMain.handle('system:open-external', (event, url: string) => {
    assertTrustedSender(event)
    if (!isExternalOpenAllowed(url)) {
      throw new Error(`Refusing to open non-http(s) URL: ${url}`)
    }
    return shell.openExternal(url)
  })

  ipcMain.handle('system:select-file', async (event, options?: Electron.OpenDialogOptions) => {
    assertTrustedSender(event)
    return dialog.showOpenDialog(options ?? {})
  })

  ipcMain.handle('dialog:openDirectory', async (event) => {
    assertTrustedSender(event)
    return dialog.showOpenDialog({ properties: ['openDirectory'] })
  })

  ipcMain.handle('system:save-file', async (event, defaultName: string, content: string) => {
    assertTrustedSender(event)
    const safe = sanitizeSaveFileInput(defaultName, content)
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = win
      ? await dialog.showSaveDialog(win, { defaultPath: safe.defaultName })
      : await dialog.showSaveDialog({ defaultPath: safe.defaultName })
    if (result.canceled || !result.filePath) {
      return { canceled: true as const }
    }
    await writeFile(assertLocalFilePath(result.filePath), safe.content, 'utf-8')
    return { canceled: false as const, filePath: result.filePath }
  })

  ipcMain.handle('window:minimize', (event) => {
    assertTrustedSender(event)
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', (event) => {
    assertTrustedSender(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })

  ipcMain.handle('window:close', (event) => {
    assertTrustedSender(event)
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    assertTrustedSender(event)
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
}
