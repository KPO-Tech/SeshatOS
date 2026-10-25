import { mkdir, readFile, statfs, writeFile } from 'fs/promises'
import { cpus, totalmem } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { MODEL_CATALOG as TITLE_MODELS, DEFAULT_MODEL_ID as DEFAULT_TITLE_MODEL, activateModel as activateTitleModel, disableLlama, getLlamaStatus } from './llama-manager'
import { MODEL_CATALOG as SPEECH_MODELS, activateModel as activateSpeechModel, downloadModel as downloadSpeechModel, enableLocalWhisper, getWhisperStatus } from './whisper-manager'
import { resolveRuntimeRoot } from './runtime'
import { downloadOcrPack, ocrSuitability, pickRecommendedPack, readOcrPacks } from './setup-ocr'
import { runTogether, type SetupTask } from './setup-run'

// What the person chooses to have on this computer the first time SeshatOS opens: the model that names conversations and the model that
// transcribes the voice. Each choice is a download; the wizard of the renderer shows the plan, asks, then calls runSetup.

const SETUP_FILE = 'setup.json'
const SETUP_VERSION = 1

// The models offered by the wizard: a short list out of each catalog, so the first choice stays simple. The rest is in Config.
const TITLE_CHOICES = ['qwen2.5-0.5b', 'gemma-3-270m', 'qwen2.5-1.5b']
const SPEECH_CHOICES = ['base', 'small', 'tiny']
const RECOMMENDED = { title: DEFAULT_TITLE_MODEL, speech: 'base' } as const

export type SetupComponentId = 'title' | 'speech' | 'ocr'

export type SetupOption = { id: string; label: string; sizeBytes: number; description: string; recommended: boolean }

export type SetupComponent = {
  id: SetupComponentId
  available: boolean
  unavailableReason?: string
  /** False when this computer is better left without it: the wizard starts with it unticked, and says why in note. */
  defaultOn?: boolean
  note?: string
  options: SetupOption[]
}

export type SetupPlan = { components: SetupComponent[]; freeDiskBytes: number | null }

export type SetupSelection = Partial<Record<SetupComponentId, { install: boolean; modelId: string }>>

export type SetupProgress = {
  component: SetupComponentId
  status: 'running' | 'done' | 'error'
  receivedBytes?: number
  totalBytes?: number
  message?: string
}

function setupPath() {
  return join(resolveRuntimeRoot(), SETUP_FILE)
}

async function readCompleted(): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(setupPath(), 'utf-8')) as { completed?: boolean; version?: number }
    return parsed.completed === true
  } catch {
    return false
  }
}

async function writeCompleted(): Promise<void> {
  await mkdir(resolveRuntimeRoot(), { recursive: true })
  await writeFile(setupPath(), JSON.stringify({ completed: true, version: SETUP_VERSION, at: new Date().toISOString() }), 'utf-8')
}

/**
 * Whether the first-run setup is over. A computer that already has a title or speech model was set up by an earlier version, which
 * installed them without asking: it is not asked again.
 */
export async function isSetupCompleted(): Promise<boolean> {
  // For testing the wizard and for support: SESHAT_FORCE_SETUP=1 shows it again whatever the computer already has.
  if (process.env.SESHAT_FORCE_SETUP === '1') return false
  if (await readCompleted()) return true
  const [llama, whisper] = await Promise.all([getLlamaStatus().catch(() => null), getWhisperStatus().catch(() => null)])
  const hasModel = Boolean(llama?.provisioned) || (whisper?.downloadedModelIds.length ?? 0) > 0
  if (hasModel) {
    await writeCompleted()
    return true
  }
  return false
}

export async function completeSetup(): Promise<void> {
  await writeCompleted()
}

async function freeDiskBytes(): Promise<number | null> {
  try {
    await mkdir(resolveRuntimeRoot(), { recursive: true })
    const stats = await statfs(resolveRuntimeRoot())
    return Number(stats.bavail) * Number(stats.bsize)
  } catch {
    return null
  }
}

// What the wizard says about each model, in plain words; the catalogs of the managers keep their own, more technical descriptions.
const DESCRIPTIONS: Record<string, string> = {
  'qwen2.5-0.5b': 'Good titles in many languages, and light on memory.',
  'gemma-3-270m': 'The smallest and quickest, with plainer titles.',
  'qwen2.5-1.5b': 'Better titles in more languages, using about twice the memory.',
  base: 'Fast, and accurate enough for everyday dictation.',
  small: 'More accurate, but about three times slower.',
  tiny: 'The fastest and the lightest, with more mistakes.'
}

function titleOptions(): SetupOption[] {
  return TITLE_CHOICES.flatMap((id) => {
    const model = TITLE_MODELS.find((candidate) => candidate.id === id)
    return model
      ? [{ id: model.id, label: model.label.replace(/ Instruct$/, ''), sizeBytes: model.approxSizeBytes, description: DESCRIPTIONS[id] ?? model.description, recommended: model.id === RECOMMENDED.title }]
      : []
  })
}

function speechOptions(): SetupOption[] {
  return SPEECH_CHOICES.flatMap((id) => {
    const model = SPEECH_MODELS.find((candidate) => candidate.id === id)
    return model ? [{ id: model.id, label: model.label, sizeBytes: model.approxSizeBytes, description: DESCRIPTIONS[id] ?? model.description, recommended: model.id === RECOMMENDED.speech }] : []
  })
}

// Reading scanned documents: the packs come from the backend (which knows them), the one offered first reads the language of the system,
// and the box starts ticked only on a computer that can run it comfortably.
async function ocrComponent(): Promise<SetupComponent> {
  const report = await readOcrPacks()
  if (!report || report.packs.length === 0) {
    return { id: 'ocr', available: false, unavailableReason: 'Not part of this version of SeshatOS yet.', options: [] }
  }
  if (!report.compiled) {
    return { id: 'ocr', available: false, unavailableReason: 'This version of SeshatOS cannot read scanned documents.', options: [] }
  }
  const recommended = pickRecommendedPack(report.packs, app.getLocale())
  const suitability = ocrSuitability({ totalMemoryBytes: totalmem(), cpuCount: cpus().length })
  return {
    id: 'ocr',
    available: true,
    defaultOn: suitability.ok,
    note: suitability.note,
    options: report.packs.map((pack) => ({
      id: pack.id,
      label: pack.label.replace(/ \(.*\)$/, ''),
      sizeBytes: pack.download_bytes,
      description: pack.installed ? 'Already on this computer.' : pack.label,
      recommended: pack.id === recommended
    }))
  }
}

export async function getSetupPlan(): Promise<SetupPlan> {
  const [llama, whisper, free, ocr] = await Promise.all([getLlamaStatus(), getWhisperStatus(), freeDiskBytes(), ocrComponent()])
  return {
    freeDiskBytes: free,
    components: [
      {
        id: 'title',
        available: llama.supported,
        unavailableReason: llama.supported ? undefined : 'Not available on this system yet.',
        options: titleOptions()
      },
      {
        id: 'speech',
        available: whisper.supported,
        unavailableReason: whisper.supported ? undefined : 'Not available on this system yet.',
        options: speechOptions()
      },
      ocr
    ]
  }
}

function validModel(component: SetupComponentId, modelId: string): boolean {
  // The backend knows the packs and refuses one it does not: here only a plain id is let through to its command line.
  if (component === 'ocr') return /^[a-z0-9-]{1,32}$/.test(modelId)
  return (component === 'title' ? TITLE_CHOICES : SPEECH_CHOICES).includes(modelId)
}

type Report = (progress: SetupProgress) => void

async function installTitle(modelId: string, report: Report): Promise<void> {
  await activateTitleModel(modelId, (progress) =>
    report({ component: 'title', status: 'running', receivedBytes: progress.receivedBytes, totalBytes: progress.totalBytes })
  )
}

async function installSpeech(modelId: string, report: Report): Promise<void> {
  const forward = (progress: { receivedBytes: number; totalBytes: number }) =>
    report({ component: 'speech', status: 'running', receivedBytes: progress.receivedBytes, totalBytes: progress.totalBytes })
  await downloadSpeechModel(modelId as Parameters<typeof downloadSpeechModel>[0], forward)
  await activateSpeechModel(modelId as Parameters<typeof activateSpeechModel>[0], forward)
  await enableLocalWhisper()
}

async function installOcr(packId: string, report: Report): Promise<void> {
  await downloadOcrPack(packId, (progress) => report({ component: 'ocr', status: 'running', receivedBytes: progress.receivedBytes, totalBytes: progress.totalBytes }))
}

/**
 * Installs what was chosen, all the components at the same time, and reports each as it goes. A component left out stays off: the title
 * model is turned off so it is not downloaded behind the person's back; speech was never on by itself. One that fails does not stop the
 * others.
 */
export async function runSetup(selection: SetupSelection, report: Report): Promise<void> {
  const plan: Array<[SetupComponentId, (modelId: string, report: Report) => Promise<void>]> = [
    ['title', installTitle],
    ['speech', installSpeech],
    ['ocr', installOcr]
  ]
  const tasks: SetupTask[] = plan.map(([component, install]) => ({
    id: component,
    run: async () => {
      const choice = selection[component]
      if (!choice?.install) {
        if (component === 'title') await disableLlama().catch(() => {})
        report({ component, status: 'done', message: 'Skipped' })
        return
      }
      if (!validModel(component, choice.modelId)) {
        report({ component, status: 'error', message: 'That model is not one of the choices.' })
        return
      }
      report({ component, status: 'running', receivedBytes: 0, totalBytes: 0 })
      try {
        await install(choice.modelId, report)
        report({ component, status: 'done' })
      } catch (error) {
        report({ component, status: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    }
  }))
  await runTogether(tasks, (id, error) => report({ component: id as SetupComponentId, status: 'error', message: error instanceof Error ? error.message : String(error) }))
}
