import type { IpcMain } from 'electron'
import { stat } from 'fs/promises'
import { spawn as spawnPty, type IPty } from 'node-pty'
import { assertTrustedSender } from './trusted-sender'
import { assertLocalFilePath } from './validation'

// A real terminal for the user, as opposed to terminal-relay.ts, which only
// reports the commands the agent runs. This one goes through node-pty, so the
// child gets a PTY and behaves like a terminal: line editing, colour, job
// control, full-screen programs. node-pty is a Node-API module, so its
// prebuilt binary does not have to be rebuilt per Electron version.

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24
const MAX_DIMENSION = 1000

type ShellSession = { id: string; pty: IPty }

const shellSessions = new Map<string, ShellSession>()

function resolveShellCommand() {
  if (process.platform === 'win32') {
    return { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile'], label: 'PowerShell' }
  }
  const shell = process.env.SHELL || '/bin/bash'
  return { command: shell, args: ['-l'], label: shell.split('/').pop() || 'shell' }
}

// process.env has undefined values, which node-pty's options type rejects.
function shellEnvironment(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  return env
}

function dimension(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_DIMENSION, Math.max(2, parsed))
}

export function stopAllShellSessions(): void {
  for (const session of shellSessions.values()) {
    try {
      session.pty.kill()
    } catch {
      // Already exited between the map write and here.
    }
  }
  shellSessions.clear()
}

export function registerShellHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('shell:start', async (event, payload: { id: string; cwd: string; cols?: number; rows?: number }) => {
    assertTrustedSender(event)
    const id = String(payload?.id ?? '').trim()
    if (!id) throw new Error('Shell id is required')
    const cwd = assertLocalFilePath(payload.cwd, 'Directory')
    const info = await stat(cwd)
    if (!info.isDirectory()) throw new Error('Directory must point to a folder')

    // Restarting the same panel replaces its shell rather than leaving an
    // orphan behind, which is also what makes React's double-invoked effects
    // in development land on exactly one live shell.
    const existing = shellSessions.get(id)
    if (existing) {
      try {
        existing.pty.kill()
      } catch {
        // Same as above: it may already be gone.
      }
      shellSessions.delete(id)
    }

    const shell = resolveShellCommand()
    const session = spawnPty(shell.command, shell.args, {
      name: 'xterm-256color',
      cols: dimension(payload?.cols, DEFAULT_COLS),
      rows: dimension(payload?.rows, DEFAULT_ROWS),
      cwd,
      env: shellEnvironment(),
    })
    shellSessions.set(id, { id, pty: session })

    session.onData((data) => {
      if (!event.sender.isDestroyed()) event.sender.send('shell:data', { id, data })
    })
    session.onExit(({ exitCode, signal }) => {
      if (shellSessions.get(id)?.pty === session) shellSessions.delete(id)
      if (!event.sender.isDestroyed()) event.sender.send('shell:exit', { id, exitCode, signal })
    })

    return { id, shell: shell.label, cwd, pid: session.pid }
  })

  ipcMain.handle('shell:write', (event, payload: { id: string; data: string }) => {
    assertTrustedSender(event)
    const session = shellSessions.get(String(payload?.id ?? ''))
    if (!session) throw new Error('Shell session is not running')
    session.pty.write(String(payload?.data ?? ''))
  })

  ipcMain.handle('shell:resize', (event, payload: { id: string; cols: number; rows: number }) => {
    assertTrustedSender(event)
    const session = shellSessions.get(String(payload?.id ?? ''))
    if (!session) return
    try {
      session.pty.resize(dimension(payload?.cols, DEFAULT_COLS), dimension(payload?.rows, DEFAULT_ROWS))
    } catch {
      // A pty that has just exited throws on resize; the exit event is what
      // tells the UI, so this stays quiet.
    }
  })

  ipcMain.handle('shell:stop', (event, id: string) => {
    assertTrustedSender(event)
    const session = shellSessions.get(String(id ?? ''))
    if (!session) return
    shellSessions.delete(session.id)
    try {
      session.pty.kill()
    } catch {
      // Already gone.
    }
  })
}
