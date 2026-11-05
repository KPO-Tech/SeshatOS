import type { TFunction } from 'i18next'
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

/** The points of the licence, as keys of the catalogue: the panel translates them. */
export const INDRA_LICENSE_POINTS = [
  'config:knowledge.indraView.licensePoint1',
  'config:knowledge.indraView.licensePoint2',
  'config:knowledge.indraView.licensePoint3',
  'config:knowledge.indraView.licensePoint4',
  'config:knowledge.indraView.licensePoint5'
]

/** The label of the pill: what Indra is now. */
export function indraPill(phase: IndraPhase, t: TFunction): { tone: 'ok' | 'muted' | 'warn'; label: string } {
  switch (phase) {
    case 'on':
      return { tone: 'ok', label: t('config:knowledge.indraView.on') }
    case 'off':
      return { tone: 'muted', label: t('config:knowledge.indraView.off') }
    case 'installing':
      return { tone: 'warn', label: t('config:knowledge.indraView.installing') }
    case 'relicense':
      return { tone: 'warn', label: t('config:knowledge.indraView.licenceToAccept') }
    default:
      return { tone: 'muted', label: t('config:knowledge.indraView.notInstalled') }
  }
}

/** The line under the install progress: "Step 2 of 4 · Creating the environment". */
export function indraStepText(install: IndraInstallState, t: TFunction): string {
  if (install.status !== 'running') return ''
  const step = install.step ?? t('config:knowledge.indraView.starting')
  return install.step_index && install.step_count ? t('config:knowledge.indraView.stepOf', { index: install.step_index, total: install.step_count, step }) : step
}

/** The installation can take minutes; the numbers a person should know before they start. */
export function indraSizeText(status: IndraStatus, t: TFunction): string {
  return t('config:knowledge.indraView.sizeText', { size: status.size_mb })
}
