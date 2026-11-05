import type { TFunction } from 'i18next'
import type { SandboxMode } from './sandboxApi'

interface ConfinementView {
  label: string
  confined: boolean
  text: string
}

/** What to tell the user about command confinement. "Not confined" is said as plainly as the others. */
export function confinementView(mode: SandboxMode, directConfined: boolean, t: TFunction): ConfinementView {
  if (mode === 'project') {
    return {
      label: t('config:environment.confinementView.sandbox'),
      confined: true,
      text: t('config:environment.confinementView.sandboxText')
    }
  }
  if (directConfined) {
    return { label: t('config:environment.confinementView.landlock'), confined: true, text: t('config:environment.confinementView.landlockText') }
  }
  return { label: t('config:environment.confinementView.notConfined'), confined: false, text: t('config:environment.confinementView.notConfinedText') }
}
