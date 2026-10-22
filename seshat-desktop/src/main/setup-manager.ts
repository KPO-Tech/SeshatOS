import { mkdir, readFile, statfs, writeFile } from 'fs/promises'
import { join } from 'path'
import { MODEL_CATALOG as TITLE_MODELS, DEFAULT_MODEL_ID as DEFAULT_TITLE_MODEL, activateModel as activateTitleModel, disableLlama, getLlamaStatus } from './llama-manager'
import { MODEL_CATALOG as SPEECH_MODELS, activateModel as activateSpeechModel, downloadModel as downloadSpeechModel, enableLocalWhisper, getWhisperStatus } from './whisper-manager'
import { resolveRuntimeRoot } from './runtime'

// What the person chooses to have on this computer the first time SeshatOS opens: the model that names conversations and the model that
// transcribes the voice. Each choice is a download; the wizard of the renderer shows the plan, asks, then calls runSetup.

const SETUP_FILE = 'setup.json'
const SETUP_VERSION = 1

// The models offered by the wizard: a short list out of each catalog, so the first choice stays simple. The rest is in Config.
const TITLE_CHOICES = ['qwen2.5-0.5b', 'gemma-3-270m', 'qwen2.5-1.5b']
const SPEECH_CHOICES = ['base', 'small', 'tiny']
const RECOMMENDED = { title: DEFAULT_TITLE_MODEL, speech: 'base' } as const

export type SetupComponentId = 'title' | 'speech'

export type SetupOption = { id: string; label: string; sizeBytes: number; description: string; recommended: boolean }

export type SetupComponent = {
  id: SetupComponentId
  available: boolean
  unavailableReason?: string
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

export async function getSetupPlan(): Promise<SetupPlan> {
  const [llama, whisper, free] = await Promise.all([getLlamaStatus(), getWhisperStatus(), freeDiskBytes()])
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
      }
    ]
  }
}

function validModel(component: SetupComponentId, modelId: string): boolean {
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

/**
 * Installs what was chosen, one component after the other, and reports each. A component left out stays off: the title model is turned
 * off so it is not downloaded behind the person's back; speech was never on by itself. One that fails does not stop the next one.
 */
export async function runSetup(selection: SetupSelection, report: Report): Promise<void> {
  const plan: Array<[SetupComponentId, (modelId: string, report: Report) => Promise<void>]> = [
    ['title', installTitle],
    ['speech', installSpeech]
  ]
  for (const [component, install] of plan) {
    const choice = selection[component]
    if (!choice?.install) {
      if (component === 'title') await disableLlama().catch(() => {})
      report({ component, status: 'done', message: 'Skipped' })
      continue
    }
    if (!validModel(component, choice.modelId)) {
      report({ component, status: 'error', message: 'That model is not one of the choices.' })
      continue
    }
    report({ component, status: 'running', receivedBytes: 0, totalBytes: 0 })
    try {
      await install(choice.modelId, report)
      report({ component, status: 'done' })
    } catch (error) {
      report({ component, status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }
}
