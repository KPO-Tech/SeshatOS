import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { chmod, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { resolveRuntimeRoot } from './runtime'
import { callBackendAsCurrentUser } from './ipc/backend'
import { titleModelRejection } from './ipc/title-model-guard'
import { downloadToFile, extractArchive, findFreePort, waitUntilReady } from './local-runtime-utils'

// Runs a tiny non-reasoning GGUF model through llama.cpp's llama-server so
// session titles are generated locally, in parallel with the agent's answer.
// seshat-backend only learns the server's URL and model name (see
// /settings/local-title); it never loads the model itself.
const LLAMA_RELEASE_TAG = 'b11342'
const LLAMA_RELEASE_BASE = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE_TAG}`
const HF_BASE_URL = 'https://huggingface.co'
const STATE_FILE = 'state.json'
const REPORT_RETRY_INTERVAL_MS = 5_000
const REPORT_MAX_ATTEMPTS = 120

export type TitleModelInfo = {
  id: string
  label: string
  repo: string
  filename: string
  approxSizeBytes: number
  description: string
  custom?: boolean
}

// Only non-reasoning instruct models belong here. A reasoning model burns its
// output budget on a hidden chain of thought and never returns a title.
export const MODEL_CATALOG: TitleModelInfo[] = [
  {
    id: 'qwen2.5-0.5b',
    label: 'Qwen2.5 0.5B Instruct',
    repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    approxSizeBytes: 491_400_032,
    description: 'Default. Small, multilingual, Apache-2.0.',
  },
  {
    id: 'gemma-3-270m',
    label: 'Gemma 3 270M Instruct',
    repo: 'unsloth/gemma-3-270m-it-GGUF',
    filename: 'gemma-3-270m-it-Q4_K_M.gguf',
    approxSizeBytes: 253_115_424,
    description: 'Smallest option. Faster, rougher titles. Gemma terms of use apply.',
  },
  {
    id: 'qwen2.5-1.5b',
    label: 'Qwen2.5 1.5B Instruct',
    repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    approxSizeBytes: 1_117_320_736,
    description: 'Better titles in more languages, about twice the memory and time.',
  },
]

const DEFAULT_MODEL_ID = 'qwen2.5-0.5b'

const HF_REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/
const HF_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.gguf$/

type PersistedState = {
  provisioned: boolean
  enabled: boolean
  activeModelId: string
  customModels: TitleModelInfo[]
}

export type LlamaPhase = 'binary' | 'model'

export type LlamaProgress = {
  phase: LlamaPhase
  modelId?: string
  receivedBytes: number
  totalBytes: number
}

export type LlamaStatus = {
  supported: boolean
  binaryReady: boolean
  running: boolean
  enabled: boolean
  provisioned: boolean
  port?: number
  activeModelId: string
  downloadedModelIds: string[]
  models: TitleModelInfo[]
}

let serverProcess: ChildProcess | null = null
let serverPort: number | null = null
let reportGeneration = 0
let provisioning: Promise<void> | null = null

function llamaDir() {
  return join(resolveRuntimeRoot(), 'llama')
}

async function readState(): Promise<PersistedState> {
  try {
    const parsed = JSON.parse(await readFile(join(llamaDir(), STATE_FILE), 'utf-8')) as Partial<PersistedState>
    return {
      provisioned: parsed.provisioned === true,
      enabled: parsed.enabled !== false,
      activeModelId: typeof parsed.activeModelId === 'string' ? parsed.activeModelId : DEFAULT_MODEL_ID,
      customModels: Array.isArray(parsed.customModels) ? parsed.customModels : [],
    }
  } catch {
    return { provisioned: false, enabled: true, activeModelId: DEFAULT_MODEL_ID, customModels: [] }
  }
}

async function writeState(state: PersistedState): Promise<void> {
  await mkdir(llamaDir(), { recursive: true })
  await writeFile(join(llamaDir(), STATE_FILE), JSON.stringify(state, null, 2), 'utf-8')
}

function allModels(state: PersistedState): TitleModelInfo[] {
  return [...MODEL_CATALOG, ...state.customModels]
}

function findModel(state: PersistedState, id: string): TitleModelInfo {
  const model = allModels(state).find((m) => m.id === id)
  if (!model) throw new Error(`Unknown title model: ${id}`)
  return model
}

function modelPath(model: TitleModelInfo) {
  return join(llamaDir(), 'models', model.repo.replace('/', '__'), model.filename)
}

function archiveName(): string | null {
  const arch = process.arch
  if (process.platform === 'win32') {
    if (arch === 'x64') return `llama-${LLAMA_RELEASE_TAG}-bin-win-cpu-x64.zip`
    if (arch === 'arm64') return `llama-${LLAMA_RELEASE_TAG}-bin-win-cpu-arm64.zip`
  }
  if (process.platform === 'linux') {
    if (arch === 'x64') return `llama-${LLAMA_RELEASE_TAG}-bin-ubuntu-x64.tar.gz`
    if (arch === 'arm64') return `llama-${LLAMA_RELEASE_TAG}-bin-ubuntu-arm64.tar.gz`
  }
  if (process.platform === 'darwin') {
    if (arch === 'x64') return `llama-${LLAMA_RELEASE_TAG}-bin-macos-x64.tar.gz`
    if (arch === 'arm64') return `llama-${LLAMA_RELEASE_TAG}-bin-macos-arm64.tar.gz`
  }
  return null
}

export function isLlamaSupported(): boolean {
  return archiveName() !== null
}

const SERVER_BINARY = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'

// The archives nest the binary under a release-specific folder (or none at
// all, on Windows), so it is located by name instead of a hard-coded path.
async function findServerBinary(root: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isFile() && entry.name === SERVER_BINARY) return join(root, entry.name)
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = await findServerBinary(join(root, entry.name))
      if (found) return found
    }
  }
  return null
}

async function serverBinaryPath(): Promise<string | null> {
  return findServerBinary(join(llamaDir(), 'bin'))
}

export async function getLlamaStatus(): Promise<LlamaStatus> {
  const state = await readState()
  const models = allModels(state)
  return {
    supported: isLlamaSupported(),
    binaryReady: (await serverBinaryPath()) !== null,
    running: serverProcess != null,
    enabled: state.enabled,
    provisioned: state.provisioned,
    port: serverPort ?? undefined,
    activeModelId: state.activeModelId,
    downloadedModelIds: models.filter((m) => existsSync(modelPath(m))).map((m) => m.id),
    models,
  }
}

async function ensureBinaryDownloaded(onProgress?: (p: LlamaProgress) => void): Promise<string> {
  const archive = archiveName()
  if (!archive) throw new Error('Local title models are not available on this platform yet.')
  const existing = await serverBinaryPath()
  if (existing) return existing

  const dir = llamaDir()
  await mkdir(dir, { recursive: true })
  const archivePath = join(dir, archive)
  await downloadToFile(`${LLAMA_RELEASE_BASE}/${archive}`, archivePath, (receivedBytes, totalBytes) =>
    onProgress?.({ phase: 'binary', receivedBytes, totalBytes }))

  // Extract aside and rename into place only once complete, so a killed
  // extraction never leaves a half-populated bin/ that looks installed.
  const binDir = join(dir, 'bin')
  const stagingDir = join(dir, `bin.staging-${process.pid}`)
  await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
  await mkdir(stagingDir, { recursive: true })
  await extractArchive(archivePath, stagingDir)
  await unlink(archivePath).catch(() => {})
  await rm(binDir, { recursive: true, force: true }).catch(() => {})
  await rename(stagingDir, binDir)

  const binary = await findServerBinary(binDir)
  if (!binary) throw new Error('llama-server was not found in the downloaded archive.')
  if (process.platform !== 'win32') {
    const siblingDir = join(binary, '..')
    for (const entry of await readdir(siblingDir).catch(() => [])) {
      const full = join(siblingDir, entry)
      if ((await stat(full).catch(() => null))?.isFile()) await chmod(full, 0o755).catch(() => {})
    }
  }
  return binary
}

async function ensureModelDownloaded(model: TitleModelInfo, onProgress?: (p: LlamaProgress) => void): Promise<void> {
  const path = modelPath(model)
  if (existsSync(path)) return
  const partial = `${path}.partial`
  await rm(partial, { force: true }).catch(() => {})
  try {
    await downloadToFile(`${HF_BASE_URL}/${model.repo}/resolve/main/${model.filename}`, partial, (receivedBytes, totalBytes) =>
      onProgress?.({ phase: 'model', modelId: model.id, receivedBytes, totalBytes }))
    await rename(partial, path)
  } catch (error) {
    await rm(partial, { force: true }).catch(() => {})
    throw error
  }
}

async function reportToBackend(payload: { enabled: boolean; base_url: string; model: string }): Promise<boolean> {
  try {
    await callBackendAsCurrentUser('/settings/local-title', 'PUT', payload)
    return true
  } catch {
    return false
  }
}

// The backend only accepts the call once the user has a session, which on a
// first launch can be minutes after the server is up, so keep trying.
function reportWhenPossible(payload: { enabled: boolean; base_url: string; model: string }) {
  const generation = ++reportGeneration
  void (async () => {
    for (let attempt = 0; attempt < REPORT_MAX_ATTEMPTS && generation === reportGeneration; attempt++) {
      if (await reportToBackend(payload)) return
      await new Promise((resolve) => setTimeout(resolve, REPORT_RETRY_INTERVAL_MS))
    }
  })()
}

/** Spawns llama-server with the active model and points the backend at it. */
export async function startLlamaServer(): Promise<void> {
  if (serverProcess) return
  const state = await readState()
  const binary = await serverBinaryPath()
  const model = findModel(state, state.activeModelId)
  if (!binary || !existsSync(modelPath(model))) {
    throw new Error('The local title model is not downloaded yet.')
  }

  const port = await findFreePort()
  const logStream = createWriteStream(join(llamaDir(), 'llama-server.log'), { flags: 'a' })
  const binaryDir = join(binary, '..')
  const child = spawn(binary, [
    '-m', modelPath(model),
    '--host', '127.0.0.1',
    '--port', String(port),
    // A title is one short prompt: a small context and two threads keep the
    // footprint to a few hundred MB and a couple of cores.
    '-c', '1024',
    '-t', '2',
    '-np', '1',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: binaryDir,
    env: { ...process.env, LD_LIBRARY_PATH: binaryDir, DYLD_LIBRARY_PATH: binaryDir },
  })
  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)
  child.on('exit', (code, signal) => {
    logStream.write(`[llama-manager] llama-server exited (code=${code}, signal=${signal})\n`)
    if (serverProcess === child) {
      serverProcess = null
      serverPort = null
      reportWhenPossible({ enabled: false, base_url: '', model: '' })
    }
  })
  serverProcess = child
  serverPort = port

  try {
    await waitUntilReady(port, 'llama-server', 60_000)
  } catch (error) {
    stopLlamaServerProcess()
    throw error
  }
  reportWhenPossible({ enabled: true, base_url: `http://127.0.0.1:${port}`, model: model.filename.replace(/\.gguf$/i, '') })
}

/** Best-effort kill with no backend call. Used on quit and before a model switch. */
export function stopLlamaServerProcess(): void {
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

export async function enableLlama(): Promise<void> {
  const state = await readState()
  await writeState({ ...state, enabled: true })
  await startLlamaServer()
}

export async function disableLlama(): Promise<void> {
  const state = await readState()
  await writeState({ ...state, enabled: false })
  stopLlamaServerProcess()
  reportWhenPossible({ enabled: false, base_url: '', model: '' })
}

/**
 * Installs llama.cpp and the default model, then starts serving. Idempotent,
 * and shared between concurrent callers so a first-launch run and a manual
 * "set up" click never download twice.
 */
export function provisionDefaults(onProgress?: (p: LlamaProgress) => void): Promise<void> {
  if (provisioning) return provisioning
  provisioning = (async () => {
    await ensureBinaryDownloaded(onProgress)
    const state = await readState()
    await ensureModelDownloaded(findModel(state, state.activeModelId), onProgress)
    await writeState({ ...state, provisioned: true })
    if (state.enabled) await startLlamaServer()
  })().finally(() => {
    provisioning = null
  })
  return provisioning
}

/** First launch installs everything; later launches just restart the server if it is enabled. */
export async function startLlamaOnLaunch(onProgress?: (p: LlamaProgress) => void): Promise<void> {
  if (!isLlamaSupported()) return
  const state = await readState()
  if (!state.enabled) return
  await provisionDefaults(onProgress)
}

export async function downloadModel(modelId: string, onProgress?: (p: LlamaProgress) => void): Promise<void> {
  const state = await readState()
  await ensureBinaryDownloaded(onProgress)
  await ensureModelDownloaded(findModel(state, modelId), onProgress)
}

/** Registers a user-supplied GGUF from Hugging Face, after refusing reasoning models. */
export async function addCustomModel(repo: string, filename: string): Promise<TitleModelInfo> {
  const cleanRepo = repo.trim()
  const cleanFile = filename.trim()
  if (!HF_REPO_PATTERN.test(cleanRepo)) throw new Error('Repository must look like owner/name.')
  if (!HF_FILE_PATTERN.test(cleanFile)) throw new Error('File must be a .gguf file name.')
  const rejection = titleModelRejection(`${cleanRepo}/${cleanFile}`)
  if (rejection) throw new Error(rejection)

  const state = await readState()
  const id = `custom:${cleanRepo}/${cleanFile}`
  if (allModels(state).some((m) => m.id === id)) return findModel(state, id)
  const model: TitleModelInfo = {
    id,
    label: cleanFile.replace(/\.gguf$/i, ''),
    repo: cleanRepo,
    filename: cleanFile,
    approxSizeBytes: 0,
    description: `Custom model from ${cleanRepo}.`,
    custom: true,
  }
  await writeState({ ...state, customModels: [...state.customModels, model] })
  return model
}

/** Makes modelId the active title model, downloading it first and restarting the server. */
export async function activateModel(modelId: string, onProgress?: (p: LlamaProgress) => void): Promise<void> {
  const state = await readState()
  const model = findModel(state, modelId)
  await ensureBinaryDownloaded(onProgress)
  await ensureModelDownloaded(model, onProgress)
  stopLlamaServerProcess()
  await writeState({ ...state, activeModelId: modelId, provisioned: true })
  if (state.enabled) await startLlamaServer()
}

export async function deleteModel(modelId: string): Promise<void> {
  const state = await readState()
  if (modelId === state.activeModelId) throw new Error('Switch to a different model before deleting this one.')
  const model = findModel(state, modelId)
  await rm(modelPath(model), { force: true })
  if (model.custom) await writeState({ ...state, customModels: state.customModels.filter((m) => m.id !== modelId) })
}
