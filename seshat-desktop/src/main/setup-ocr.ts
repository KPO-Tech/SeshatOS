import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { withBackendLibraries } from './backend-env'

// The part of the first-run setup that installs the OCR models (the reading of scanned documents). The backend knows the packs, where they
// come from and how to turn them into the files the runtime reads; this file only runs its two commands (--ocr-packs and
// --download-ocr-pack, see seshat-backend/cmd/api/ocr_cli.go) and turns their JSON lines into what the wizard shows.

export type OcrPack = {
  id: string
  label: string
  languages: string[]
  size_mb: number
  /** About what is left to download now: the shared models not on disk, plus the recognizer unless it is installed. */
  download_bytes: number
  installed: boolean
  active: boolean
}

export type OcrPacksReport = { compiled: boolean; model_dir: string; packs: OcrPack[] }

export type OcrDownloadEvent = {
  event: 'progress' | 'done' | 'error'
  file?: string
  file_index?: number
  file_count?: number
  received?: number
  /** The size of the file, or -1 when the server did not announce it. */
  total?: number
  message?: string
}

/** The JSON lines of a command's output, in order. Anything else on stdout (a log line) is ignored. */
export function parseJsonLines<T>(text: string): T[] {
  const items: T[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      items.push(JSON.parse(trimmed) as T)
    } catch {
      // A partial line (the process was cut) is not an event.
    }
  }
  return items
}

/** The pack to start from: the one that reads the language of the system, the Latin one when none does. */
export function pickRecommendedPack(packs: OcrPack[], locale: string): string | null {
  if (packs.length === 0) return null
  const language = locale.split(/[-_]/)[0].toLowerCase()
  // English is read by every pack: it says nothing about which to prefer, so the Latin one (smaller, with the accents of the words
  // a document borrows) wins unless the language is one only another pack reads.
  const own = language === 'en' ? undefined : packs.find((pack) => pack.languages.includes(language))
  return (own ?? packs.find((pack) => pack.id === 'latin') ?? packs[0]).id
}

const GIB = 1024 ** 3

/**
 * Whether this computer reads scanned pages comfortably: the OCR runs on the processor, a page takes tens of seconds, and the models
 * want memory. Below that it stays an offer, not ticked, and can be added later.
 */
export function ocrSuitability(machine: { totalMemoryBytes: number; cpuCount: number }): { ok: boolean; note?: string } {
  if (machine.totalMemoryBytes >= 7 * GIB && machine.cpuCount >= 4) return { ok: true }
  return {
    ok: false,
    note: 'Not ticked: reading scanned pages is slow with less than 8 GB of memory or 4 processor cores. You can add it later in Config.'
  }
}

/** Adds up the progress of the files of one download, in bytes, against the total announced for the whole pack. */
export class OcrProgressTracker {
  private readonly received = new Map<string, number>()

  constructor(readonly totalBytes: number) {}

  update(event: OcrDownloadEvent): { receivedBytes: number; totalBytes: number } {
    if (event.event === 'progress' && event.file) {
      this.received.set(event.file, Math.max(this.received.get(event.file) ?? 0, event.received ?? 0))
    }
    let sum = 0
    for (const value of this.received.values()) sum += value
    // The total is an estimate: never report more than it, and the bar must not run backwards.
    return { receivedBytes: Math.min(sum, this.totalBytes), totalBytes: this.totalBytes }
  }
}

function backendBinaryName() {
  return process.platform === 'win32' ? 'seshat-backend.exe' : 'seshat-backend'
}

/**
 * The backend that answers the OCR commands: the bundled one. SESHAT_SETUP_BACKEND points to another binary, which is how the wizard is
 * tried against a build made by hand, since an unpackaged app has no bundled backend.
 */
export function resolveOcrBackendBinary(): string | null {
  const override = process.env.SESHAT_SETUP_BACKEND?.trim()
  const candidate = override || join(process.resourcesPath ?? '', 'backend', backendBinaryName())
  return existsSync(candidate) ? candidate : null
}

type RunResult = { code: number | null; lines: string[] }

/** Runs a backend command and collects its output; onLine sees each line as it arrives. */
export function runBackendCommand(binary: string, args: string[], onLine?: (line: string) => void, timeoutMs?: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // The backend of the native OCR build is linked to pdfium: it must find it to start, even for a command that never reads a page.
    const child = spawn(binary, args, { env: withBackendLibraries(process.env, dirname(binary)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const lines: string[] = []
    let pending = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      const parts = pending.split(/\r?\n/)
      pending = parts.pop() ?? ''
      for (const line of parts) {
        lines.push(line)
        onLine?.(line)
      }
    })
    child.stderr.resume()
    const timer = timeoutMs
      ? setTimeout(() => {
          child.kill()
          reject(new Error('The backend did not answer in time.'))
        }, timeoutMs)
      : null
    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (pending) {
        lines.push(pending)
        onLine?.(pending)
      }
      resolve({ code, lines })
    })
  })
}

/** What the backend says about the OCR packs, or null when this build cannot be asked. */
export async function readOcrPacks(): Promise<OcrPacksReport | null> {
  const binary = resolveOcrBackendBinary()
  if (!binary) return null
  try {
    const { lines } = await runBackendCommand(binary, ['--ocr-packs'], undefined, 15_000)
    const [report] = parseJsonLines<OcrPacksReport>(lines.join('\n'))
    return report && Array.isArray(report.packs) ? report : null
  } catch {
    return null
  }
}

/**
 * Downloads one pack with the backend, reporting how many bytes have arrived. Resolves when it is done and rejects with the backend's
 * message when it is not.
 */
export async function downloadOcrPack(packId: string, onProgress: (progress: { receivedBytes: number; totalBytes: number }) => void): Promise<void> {
  const binary = resolveOcrBackendBinary()
  if (!binary) throw new Error('Reading scanned documents is not part of this version of SeshatOS.')
  const report = await readOcrPacks()
  const total = report?.packs.find((pack) => pack.id === packId)?.download_bytes ?? 0
  const tracker = new OcrProgressTracker(total)
  let failure = ''
  const { code } = await runBackendCommand(binary, ['--download-ocr-pack', packId], (line) => {
    const [event] = parseJsonLines<OcrDownloadEvent>(line)
    if (!event) return
    if (event.event === 'error') failure = event.message ?? 'The download failed.'
    else onProgress(tracker.update(event))
  })
  if (code !== 0) throw new Error(failure || `The download stopped (code ${code}).`)
  onProgress({ receivedBytes: total, totalBytes: total })
}
