import { app } from 'electron'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

// Command confinement for the agent's bash tool on macOS and Windows.
//
// seshat-runtime confines shell commands with Landlock on Linux only. On the other systems it uses Anthropic's `srt`
// (sandbox-runtime, Apache-2.0) when an `srt` command is available. The desktop ships that package, so it does not
// ask the user to install Node or npm: a small launcher runs the packaged CLI with Electron's own Node, and the
// backend is pointed at it through SESHAT_SRT.
//
// macOS needs nothing more (Seatbelt is part of the system). Windows needs a one-time setup that creates a
// low-privilege local user and a network filter, and shows one UAC prompt: `enableSrt` runs it on request, never on
// its own.

export type SrtState = 'ready' | 'needs-setup' | 'unavailable' | 'not-needed'

export interface SrtStatus {
  state: SrtState
  platform: NodeJS.Platform
  /** What srt said when it could not confine, for the settings page. */
  detail?: string
}

const PROBE_TIMEOUT_MS = 30_000
const SETUP_TIMEOUT_MS = 5 * 60_000

function cliPath(): string | null {
  const packaged = join(process.resourcesPath ?? '', 'sandbox-runtime', 'dist', 'cli.js')
  if (app.isPackaged) return existsSync(packaged) ? packaged : null
  try {
    return createRequire(join(app.getAppPath(), 'package.json')).resolve('@anthropic-ai/sandbox-runtime/dist/cli.js')
  } catch {
    return null
  }
}

/** Writes the launcher (once per run) and returns its path, or null when the packaged CLI is missing. */
export function ensureSrtLauncher(): string | null {
  const cli = cliPath()
  if (!cli) return null
  const dir = join(app.getPath('userData'), 'bin')
  mkdirSync(dir, { recursive: true })
  if (process.platform === 'win32') {
    const file = join(dir, 'srt.cmd')
    writeFileSync(file, `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${cli}" %*\r\n`)
    return file
  }
  const file = join(dir, 'srt')
  writeFileSync(file, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "${cli}" "$@"\n`)
  chmodSync(file, 0o755)
  return file
}

/** Environment the backend needs to use the packaged srt; empty on Linux (Landlock) or when the user set their own. */
export function srtEnvironment(): Record<string, string> {
  if (process.platform === 'linux' || process.env.SESHAT_SRT) return {}
  const launcher = ensureSrtLauncher()
  return launcher ? { SESHAT_SRT: launcher } : {}
}

function run(launcher: string, args: string[], timeoutMs: number): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    // A .cmd launcher needs a shell on Windows; its path (which may hold spaces) is quoted for it.
    const windows = process.platform === 'win32'
    const child = spawn(windows ? `"${launcher}"` : launcher, args, { windowsHide: true, shell: windows })
    let output = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stdout?.on('data', (chunk) => { output += chunk.toString() })
    child.stderr?.on('data', (chunk) => { output += chunk.toString() })
    child.on('error', (error) => { clearTimeout(timer); resolve({ code: null, output: error.message }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output: output.trim() }) })
  })
}

function probeArgs(): string[] {
  const settings = join(app.getPath('userData'), 'bin', 'srt-probe.json')
  writeFileSync(settings, JSON.stringify({
    filesystem: { denyRead: [], allowWrite: [app.getPath('temp')], denyWrite: [] },
    network: { allowedDomains: [], deniedDomains: [] },
  }))
  const trivial = process.platform === 'win32' ? ['cmd', '/C', 'exit 0'] : ['sh', '-c', 'exit 0']
  return ['--settings', `"${settings}"`, '--', ...trivial]
}

/** Tries a trivial confined command, the same check the backend makes before it relies on srt. */
export async function srtStatus(): Promise<SrtStatus> {
  const platform = process.platform
  if (platform === 'linux') return { state: 'not-needed', platform }
  const launcher = ensureSrtLauncher()
  if (!launcher) return { state: 'unavailable', platform, detail: 'The confinement component is missing from this build.' }
  const { code, output } = await run(launcher, probeArgs(), PROBE_TIMEOUT_MS)
  if (code === 0) return { state: 'ready', platform }
  const needsSetup = platform === 'win32' && /not provisioned|windows-install/i.test(output)
  return { state: needsSetup ? 'needs-setup' : 'unavailable', platform, detail: output.slice(0, 600) }
}

/** Windows only: the one-time setup. Shows one UAC prompt. Returns the new status. */
export async function enableSrt(): Promise<SrtStatus> {
  if (process.platform !== 'win32') return srtStatus()
  const launcher = ensureSrtLauncher()
  if (!launcher) return srtStatus()
  const result = await run(launcher, ['windows-install'], SETUP_TIMEOUT_MS)
  const status = await srtStatus()
  if (status.state !== 'ready' && result.output && !status.detail) status.detail = result.output.slice(0, 600)
  return status
}
