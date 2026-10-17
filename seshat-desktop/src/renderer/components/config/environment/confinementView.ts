export interface ConfinementView {
  label: string
  confined: boolean
  canEnable: boolean
  text: string
}

/** What to tell the user about command confinement, from the packaged srt's status and the Docker setting. */
export function confinementView(status: SrtStatus | null, docker: boolean): ConfinementView {
  if (docker) {
    return { label: 'Docker', confined: true, canEnable: false, text: 'Commands run inside a Docker container, isolated from the rest of this machine.' }
  }
  if (!status) {
    return { label: 'Unknown', confined: false, canEnable: false, text: 'The confinement status is not available in this build.' }
  }
  switch (status.state) {
    case 'not-needed':
      return { label: 'Landlock', confined: true, canEnable: false, text: 'Commands are confined by the Linux kernel (Landlock): they can write only inside the project folder and the temporary folder.' }
    case 'ready':
      return { label: 'Confined', confined: true, canEnable: false, text: 'Commands run inside a sandbox: they can write only inside the project folder and the temporary folder, cannot read SSH, cloud or GPG keys, and can reach only common code hosts and package registries.' }
    case 'needs-setup':
      return { label: 'Not confined', confined: false, canEnable: true, text: 'Commands currently run with your full user rights. Windows needs a one-time setup to confine them: it creates a low-privilege local account and a network filter, and shows one administrator prompt.' }
    default:
      return { label: 'Not confined', confined: false, canEnable: false, text: 'Commands currently run with your full user rights: the confinement component could not start on this machine. Choose Isolated (Docker) above for a confined run.' }
  }
}
