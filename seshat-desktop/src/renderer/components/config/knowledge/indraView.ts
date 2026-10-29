import type { IndraInstallState, IndraStatus } from './knowledgeTypes'

// What the Indra OCR card shows, from what the backend reports. Indra is optional and its weights have a licence, so every state says what
// the person can do next and nothing is installed before they have accepted it.

export type IndraPhase =
  | 'no-python' // Python 3.10 or newer is needed to install it
  | 'available' // can be installed: the licence is shown first
  | 'installing'
  | 'failed' // the last installation failed; it can be tried again
  | 'on' // installed and reading scanned pages
  | 'off' // installed, switched off
  | 'relicense' // installed, but the licence text changed since it was accepted

export function indraPhase(status: IndraStatus, install: IndraInstallState): IndraPhase {
  if (install.status === 'running') return 'installing'
  if (status.installed) {
    if (!status.license_accepted) return 'relicense'
    return status.enabled ? 'on' : 'off'
  }
  if (!status.python_found) return 'no-python'
  return install.status === 'failed' ? 'failed' : 'available'
}

export const INDRA_LICENSE_POINTS = [
  'The code is Apache 2.0. The model weights, which are downloaded from Hugging Face, are under a modified OpenRAIL-M licence from Datalab.',
  'The weights are free for personal use and research, and for organizations that made less than $20 million in revenue last year and raised less than $20 million in funding.',
  "Whatever the size, they may not be used by an organization that offers a product or service competing with Datalab's.",
  'Larger organizations need a commercial licence from Datalab.',
  "The licence applies to the text the model produces too (section 8), and asks that this notice go with copies of the model."
]

/** The label of the pill: what Indra is now. */
export function indraPill(phase: IndraPhase): { tone: 'ok' | 'muted' | 'warn'; label: string } {
  switch (phase) {
    case 'on':
      return { tone: 'ok', label: 'On' }
    case 'off':
      return { tone: 'muted', label: 'Off' }
    case 'installing':
      return { tone: 'warn', label: 'Installing' }
    case 'relicense':
      return { tone: 'warn', label: 'Licence to accept' }
    default:
      return { tone: 'muted', label: 'Not installed' }
  }
}

/** The line under the install progress: "Step 2 of 4 · Creating the environment". */
export function indraStepText(install: IndraInstallState): string {
  if (install.status !== 'running') return ''
  const step = install.step ?? 'Starting'
  return install.step_index && install.step_count ? `Step ${install.step_index} of ${install.step_count} · ${step}` : step
}

/** The installation can take minutes; the numbers a person should know before they start. */
export function indraSizeText(status: IndraStatus): string {
  return `About ${status.size_mb} MB on disk, downloaded once. Needs Python 3.10 or newer.`
}
