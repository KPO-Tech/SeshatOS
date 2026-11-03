import type { SandboxMode } from './sandboxApi'

interface ConfinementView {
  label: string
  confined: boolean
  text: string
}

/** What to tell the user about command confinement. "Not confined" is said as plainly as the others. */
export function confinementView(mode: SandboxMode, directConfined: boolean): ConfinementView {
  if (mode === 'project') {
    return {
      label: 'Sandbox',
      confined: true,
      text: "Commands can write only in the session's folder and cannot read what is listed below. They can still read other files and use the network. The agent's own file edits are not confined: they follow your permission settings."
    }
  }
  if (directConfined) {
    return { label: 'Landlock', confined: true, text: 'Commands are confined by the Linux kernel (Landlock): they can write only inside the project folder.' }
  }
  return { label: 'Not confined', confined: false, text: 'Commands run with your full user rights.' }
}
