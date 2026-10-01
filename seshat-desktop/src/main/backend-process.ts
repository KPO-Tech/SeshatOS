import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { setDynamicBackendOrigin } from './runtime'
import { resolveEnvVarOverrides } from './env-vars-manager'

const READY_LINE = /^SESHAT_BACKEND_READY port=(\d+)/
const READY_TIMEOUT_MS = 15_000
const CDP_DISCOVERY_TIMEOUT_MS = 1500

let backendProcess: ChildProcess | null = null

function backendBinaryName() {
  return process.platform === 'win32' ? 'seshat-backend.exe' : 'seshat-backend'
}

function resolveBackendBinaryPath() {
  return join(process.resourcesPath, 'backend', backendBinaryName())
}

function resolveBackendDir() {
  return join(process.resourcesPath, 'backend')
}

/**
 * Starts the bundled seshat-backend sidecar and waits for it to report the
 * port it actually bound to (it falls back to an OS-assigned free port if
 * its preferred one is taken — see cmd/api/main.go's `listen()`).
 *
 * In dev mode (unpackaged, running via electron-vite), this is a no-op:
 * the developer runs seshat-backend manually, exactly as before, and
 * resolveBackendOrigin() falls through to its existing default/env-var
 * behavior since setDynamicBackendOrigin is never called.
 */
export async function startBackendSidecar(): Promise<void> {
  if (!app.isPackaged) {
    return
  }

  const backendDir = resolveBackendDir()
  const binaryPath = resolveBackendBinaryPath()
  const logPath = join(app.getPath('logs'), 'backend-sidecar.log')
  const logStream = createWriteStream(logPath, { flags: 'a' })
  // Credentials the user pasted into Settings > Environment (Gmail OAuth,
  // Google Places, OpenAI/Gemini, ...) take precedence over whatever's in
  // the real process environment, since setting one via the UI is a more
  // deliberate choice than an ambient shell var. See env-vars-manager.ts.
  const envVarOverrides = await resolveEnvVarOverrides()
  const env = { ...process.env, ...envVarOverrides }
  if (process.platform === 'win32') {
    env.PATH = `${backendDir};${env.PATH || ''}`
    const onnxRuntimePath = join(backendDir, 'onnxruntime.dll')
    if (!env.SESHAT_NATIVEDOC_ONNXRUNTIME_PATH && existsSync(onnxRuntimePath)) {
      env.SESHAT_NATIVEDOC_ONNXRUNTIME_PATH = onnxRuntimePath
    }
  } else if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = `${backendDir}${env.LD_LIBRARY_PATH ? `:${env.LD_LIBRARY_PATH}` : ''}`
  } else if (process.platform === 'darwin') {
    env.DYLD_LIBRARY_PATH = `${backendDir}${env.DYLD_LIBRARY_PATH ? `:${env.DYLD_LIBRARY_PATH}` : ''}`
  }
  if (!env.SESHAT_NATIVEDOC_AUTO_INIT && existsSync(join(backendDir, '.nativedoc-enabled'))) {
    env.SESHAT_NATIVEDOC_AUTO_INIT = '1'
  }
  if (!env.SESHAT_BROWSER_REMOTE_CONTROL_URL) {
    const browserControlURL = await resolveElectronBrowserControlURL()
    if (browserControlURL) {
      env.SESHAT_BROWSER_REMOTE_CONTROL_URL = browserControlURL
    }
  }

  const child = spawn(binaryPath, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  })
  backendProcess = child

  child.stderr.pipe(logStream)
  child.on('error', (err) => {
    logStream.write(`[backend-process] spawn error: ${err.message}\n`)
  })
  child.on('exit', (code, signal) => {
    logStream.write(`[backend-process] exited (code=${code}, signal=${signal})\n`)
  })

  const port = await waitForReadyPort(child, logStream)
  setDynamicBackendOrigin(`http://127.0.0.1:${port}`)
}

async function resolveElectronBrowserControlURL(): Promise<string | null> {
  const port = Number.parseInt(process.env.SESHAT_ELECTRON_REMOTE_DEBUG_PORT || '', 10)
  if (!Number.isFinite(port) || port <= 0) return null
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(CDP_DISCOVERY_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const payload = await response.json() as { webSocketDebuggerUrl?: unknown }
    return typeof payload.webSocketDebuggerUrl === 'string' ? payload.webSocketDebuggerUrl : null
  } catch {
    return null
  }
}

function waitForReadyPort(child: ChildProcess, logStream: NodeJS.WritableStream): Promise<number> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`seshat-backend did not report a ready port within ${READY_TIMEOUT_MS}ms`))
    }, READY_TIMEOUT_MS)

    function onData(chunk: Buffer) {
      buffer += chunk.toString('utf-8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        logStream.write(line + '\n')
        const match = READY_LINE.exec(line.trim())
        if (match && !settled) {
          settled = true
          cleanup()
          resolve(Number(match[1]))
          return
        }
      }
    }

    function onExit(code: number | null, signal: NodeJS.Signals | null) {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`seshat-backend exited before becoming ready (code=${code}, signal=${signal})`))
    }

    function cleanup() {
      clearTimeout(timeout)
      child.stdout?.off('data', onData)
      child.off('exit', onExit)
    }

    child.stdout?.on('data', onData)
    child.on('exit', onExit)
  })
}

/**
 * Kills the sidecar, if running, and resolves once it has actually exited
 * (immediately if none was running). Called on app quit (fire-and-forget
 * there - see index.ts) and awaited by restartBackendSidecar so the
 * respawn below never races the old process's port/log-file teardown.
 */
export function stopBackendSidecar(): Promise<void> {
  return new Promise((resolve) => {
    if (!backendProcess) {
      resolve()
      return
    }
    const child = backendProcess
    backendProcess = null
    child.kill('SIGTERM')
    const forceKillTimer = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL')
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(forceKillTimer)
      resolve()
    })
  })
}

/** Stops the current sidecar (if any) and starts a fresh one - used after
 * the user changes a credential in Settings > Environment, since
 * seshat-backend only reads os.Getenv at startup (see bootstrap.go's
 * IsConfigured() checks) and has no live-reload for these. No-ops in dev
 * mode via startBackendSidecar's own app.isPackaged guard. */
export async function restartBackendSidecar(): Promise<void> {
  await stopBackendSidecar()
  await startBackendSidecar()
}
