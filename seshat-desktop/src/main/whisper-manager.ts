import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { mkdir, chmod, readdir, stat, readFile, writeFile, unlink, rm, rename } from 'fs/promises'
import { join } from 'path'
import { downloadToFile, extractArchive, findFreePort, waitUntilReady } from './local-runtime-utils'
import { resolveRuntimeRoot } from './runtime'
import { callBackendAsCurrentUser } from './ipc/backend'

// Whisper.cpp has no prebuilt CLI/server binary in its GitHub releases for
// macOS today (only an xcframework meant for Xcode/Swift embedding) - local
// transcription is Windows/Linux only until that changes.
const WHISPER_RELEASE_TAG = 'v1.9.1'
const WHISPER_RELEASE_BASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_RELEASE_TAG}`
const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'
const ACTIVE_MODEL_FILE = 'active-model.json'

// Multilingual, non-quantized tiers only for now - quantized (q5/q8) variants
// exist too but would clutter this first pass of the picker. Sizes are the
// real download sizes as of whisper.cpp's ggerganov/whisper.cpp HF repo.
export type WhisperModelId = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo' | 'large-v3'

export type WhisperModelInfo = {
  id: WhisperModelId
  filename: string
  label: string
  approxSizeBytes: number
  description: string
}

export const MODEL_CATALOG: WhisperModelInfo[] = [
  { id: 'tiny', filename: 'ggml-tiny.bin', label: 'Tiny', approxSizeBytes: 77_700_000, description: 'Fastest, least accurate - good for quick drafts.' },
  { id: 'base', filename: 'ggml-base.bin', label: 'Base', approxSizeBytes: 148_000_000, description: 'Fast, modest accuracy.' },
  { id: 'small', filename: 'ggml-small.bin', label: 'Small', approxSizeBytes: 487_600_000, description: 'Good balance of speed and accuracy - recommended default.' },
  { id: 'medium', filename: 'ggml-medium.bin', label: 'Medium', approxSizeBytes: 1_533_800_000, description: 'High accuracy, noticeably slower.' },
  { id: 'large-v3-turbo', filename: 'ggml-large-v3-turbo.bin', label: 'Large v3 Turbo', approxSizeBytes: 1_624_600_000, description: 'Near large-v3 accuracy at roughly half the compute cost.' },
  { id: 'large-v3', filename: 'ggml-large-v3.bin', label: 'Large v3', approxSizeBytes: 3_095_000_000, description: 'Best accuracy; largest download and slowest to run.' },
]

// First-time setup downloads both of these together, so there's an
// immediate fast/quality pair to compare without a second download - small
// becomes the active one since it's the better default.
const DEFAULT_MODEL_IDS: WhisperModelId[] = ['tiny', 'small']
const DEFAULT_ACTIVE_MODEL_ID: WhisperModelId = 'small'

function modelInfo(id: WhisperModelId): WhisperModelInfo {
  return MODEL_CATALOG.find((m) => m.id === id) ?? MODEL_CATALOG.find((m) => m.id === DEFAULT_ACTIVE_MODEL_ID)!
}

export type WhisperPhase = 'binary' | 'model'

export type WhisperProgress = {
  phase: WhisperPhase
  modelId?: WhisperModelId
  receivedBytes: number
  totalBytes: number
}

export type WhisperStatus = {
  supported: boolean
  running: boolean
  port?: number
  activeModelId: WhisperModelId
  downloadedModelIds: WhisperModelId[]
}

let serverProcess: ChildProcess | null = null
let serverPort: number | null = null

function whisperDir() {
  return join(resolveRuntimeRoot(), 'whisper')
}

async function readActiveModelId(): Promise<WhisperModelId> {
  try {
    const raw = await readFile(join(whisperDir(), ACTIVE_MODEL_FILE), 'utf-8')
    const parsed = JSON.parse(raw) as { modelId?: string }
    if (MODEL_CATALOG.some((m) => m.id === parsed.modelId)) {
      return parsed.modelId as WhisperModelId
    }
  } catch {
    // no selection saved yet - fall through to the default
  }
  return DEFAULT_ACTIVE_MODEL_ID
}

async function writeActiveModelId(id: WhisperModelId): Promise<void> {
  await mkdir(whisperDir(), { recursive: true })
  await writeFile(join(whisperDir(), ACTIVE_MODEL_FILE), JSON.stringify({ modelId: id }), 'utf-8')
}

function modelPath(id: WhisperModelId) {
  return join(whisperDir(), modelInfo(id).filename)
}

function downloadedModelIds(): WhisperModelId[] {
  return MODEL_CATALOG.filter((m) => existsSync(modelPath(m.id))).map((m) => m.id)
}

type PlatformAsset = {
  archiveName: string
  binaryRelPath: string
}

function platformAsset(): PlatformAsset | null {
  if (process.platform === 'win32') {
    return { archiveName: 'whisper-bin-x64.zip', binaryRelPath: 'Release/whisper-server.exe' }
  }
  if (process.platform === 'linux') {
    if (process.arch === 'arm64') {
      return { archiveName: 'whisper-bin-ubuntu-arm64.tar.gz', binaryRelPath: 'whisper-bin-ubuntu-arm64/whisper-server' }
    }
    return { archiveName: 'whisper-bin-ubuntu-x64.tar.gz', binaryRelPath: 'whisper-bin-ubuntu-x64/whisper-server' }
  }
  return null
}

function serverBinaryPath(): string | null {
  const asset = platformAsset()
  if (!asset) return null
  return join(whisperDir(), 'bin', asset.binaryRelPath)
}

export function isWhisperSupported(): boolean {
  return platformAsset() !== null
}

export async function getWhisperStatus(): Promise<WhisperStatus> {
  return {
    supported: isWhisperSupported(),
    running: serverProcess != null,
    port: serverPort ?? undefined,
    activeModelId: await readActiveModelId(),
    downloadedModelIds: downloadedModelIds(),
  }
}

async function ensureBinaryDownloaded(onProgress?: (p: WhisperProgress) => void): Promise<void> {
  const asset = platformAsset()
  if (!asset) {
    throw new Error('Local transcription is not available on this platform yet.')
  }
  const binaryPath = serverBinaryPath()
  if (binaryPath && existsSync(binaryPath)) return

  const dir = whisperDir()
  await mkdir(dir, { recursive: true })

  const archivePath = join(dir, asset.archiveName)
  await downloadToFile(`${WHISPER_RELEASE_BASE}/${asset.archiveName}`, archivePath, (receivedBytes, totalBytes) =>
    onProgress?.({ phase: 'binary', receivedBytes, totalBytes }))

  // Extract into a scratch dir and rename into place only once extraction
  // fully succeeds - if it's killed partway (e.g. antivirus quarantining a
  // freshly-written .exe/.dll on Windows), a half-populated bin/ must not
  // sit there looking "downloaded" to the existsSync() check above.
  const binDir = join(dir, 'bin')
  const stagingDir = join(dir, `bin.staging-${process.pid}`)
  await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
  await mkdir(stagingDir, { recursive: true })
  await extractArchive(archivePath, stagingDir)
  await unlink(archivePath).catch(() => {})

  await rm(binDir, { recursive: true, force: true }).catch(() => {})
  await rename(stagingDir, binDir)

  const resolvedBinaryPath = join(binDir, asset.binaryRelPath)
  if (!existsSync(resolvedBinaryPath)) {
    throw new Error(`whisper-server binary not found after extraction (expected at ${resolvedBinaryPath})`)
  }
  if (process.platform !== 'win32') {
    await chmod(resolvedBinaryPath, 0o755)
    // Shared libraries in the same folder also need to stay executable/readable;
    // tar preserves their original perms, but be defensive on stricter umasks.
    const siblingDir = join(resolvedBinaryPath, '..')
    const entries = await readdir(siblingDir).catch(() => [])
    for (const entry of entries) {
      const full = join(siblingDir, entry)
      const info = await stat(full).catch(() => null)
      if (info?.isFile()) await chmod(full, 0o755).catch(() => {})
    }
  }
}

async function ensureModelDownloaded(id: WhisperModelId, onProgress?: (p: WhisperProgress) => void): Promise<void> {
  const path = modelPath(id)
  if (existsSync(path)) return
  await downloadToFile(`${MODEL_BASE_URL}/${modelInfo(id).filename}`, path, (receivedBytes, totalBytes) =>
    onProgress?.({ phase: 'model', modelId: id, receivedBytes, totalBytes }))
}

/**
 * First-time setup: downloads the whisper-server binary plus both default
 * models (tiny + small) so there's an immediate fast/quality pair to try,
 * and makes small the active one.
 */
export async function downloadDefaultModels(onProgress?: (p: WhisperProgress) => void): Promise<void> {
  await ensureBinaryDownloaded(onProgress)
  for (const id of DEFAULT_MODEL_IDS) {
    await ensureModelDownloaded(id, onProgress)
  }
  await writeActiveModelId(DEFAULT_ACTIVE_MODEL_ID)
}

/** Adds one more model to local storage, alongside whatever's already downloaded. */
export async function downloadModel(modelId: WhisperModelId, onProgress?: (p: WhisperProgress) => void): Promise<void> {
  await ensureBinaryDownloaded(onProgress)
  await ensureModelDownloaded(modelId, onProgress)
}

/**
 * Makes modelId the one whisper-server runs with. Downloads it first if it
 * isn't already on disk. whisper-server has no hot model reload (--model is
 * fixed at spawn time), so this restarts the process when it's running -
 * nothing downloaded is deleted, multiple models can stay side by side.
 */
export async function activateModel(modelId: WhisperModelId, onProgress?: (p: WhisperProgress) => void): Promise<void> {
  const wasRunning = serverProcess != null
  if (wasRunning) {
    stopWhisperServerProcess()
  }

  await ensureModelDownloaded(modelId, onProgress)
  await writeActiveModelId(modelId)

  if (wasRunning) {
    await enableLocalWhisper()
  }
}

/** Removes a downloaded model's file. Refuses to delete the active model - switch first. */
export async function deleteModel(modelId: WhisperModelId): Promise<void> {
  const active = await readActiveModelId()
  if (modelId === active) {
    throw new Error('Switch to a different model before deleting this one.')
  }
  const path = modelPath(modelId)
  if (existsSync(path)) {
    await unlink(path)
  }
}

/** Spawns whisper-server (if not already running) using the active model, and tells seshat-backend where it is. */
export async function enableLocalWhisper(): Promise<void> {
  if (serverProcess) return

  const binaryPath = serverBinaryPath()
  const status = await getWhisperStatus()
  if (!status.supported || !binaryPath || !status.downloadedModelIds.includes(status.activeModelId)) {
    throw new Error('whisper.cpp is not downloaded yet.')
  }

  const port = await findFreePort()
  const logPath = join(whisperDir(), 'whisper-server.log')
  const logStream = createWriteStream(logPath, { flags: 'a' })

  const child = spawn(binaryPath, [
    '--model', modelPath(status.activeModelId),
    '--host', '127.0.0.1',
    '--port', String(port),
    // whisper.cpp's server defaults to serving transcription at /inference.
    // seshat's STT client (shared with the real OpenAI Whisper API) always
    // posts to "{baseURL}/audio/transcriptions" - without this flag every
    // request against a local server 404s, cloud fallback notwithstanding.
    '--inference-path', '/audio/transcriptions',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: join(binaryPath, '..'),
  })
  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)
  child.on('exit', (code, signal) => {
    logStream.write(`[whisper-manager] whisper-server exited (code=${code}, signal=${signal})\n`)
    if (serverProcess === child) {
      serverProcess = null
      serverPort = null
    }
  })

  serverProcess = child
  serverPort = port

  try {
    await waitUntilReady(port, 'whisper-server')
  } catch (error) {
    child.kill('SIGTERM')
    serverProcess = null
    serverPort = null
    throw error
  }

  await callBackendAsCurrentUser('/settings/local-stt', 'PUT', {
    enabled: true,
    base_url: `http://127.0.0.1:${port}`,
  })
}

/** Stops whisper-server (if running) and tells seshat-backend to fall back to cloud. */
export async function disableLocalWhisper(): Promise<void> {
  stopWhisperServerProcess()
  await callBackendAsCurrentUser('/settings/local-stt', 'PUT', { enabled: false, base_url: '' }).catch(() => {})
}

/** Best-effort kill with no backend call - used on app quit and before switching the active model. */
export function stopWhisperServerProcess(): void {
  if (!serverProcess) return
  const child = serverProcess
  serverProcess = null
  serverPort = null
  child.kill('SIGTERM')
  const forceKillTimer = setTimeout(() => {
    if (!child.killed) child.kill('SIGKILL')
  }, 5_000)
  child.once('exit', () => clearTimeout(forceKillTimer))
}
