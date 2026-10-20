/** The one-time Windows setup. Run by the user, on purpose: the Windows backend of srt is alpha. */
export const WINDOWS_SETUP_COMMAND = 'npx @anthropic-ai/sandbox-runtime windows-install'

interface ConfinementView {
  label: string
  confined: boolean
  text: string
}

/** What to tell the user about command confinement, from the packaged srt's status and the Docker setting. */
export function confinementView(status: SrtStatus | null, docker: boolean): ConfinementView {
  if (docker) {
    return { label: 'Docker', confined: true, text: 'Commands run inside a Docker container, isolated from the rest of this machine.' }
  }
  if (!status) {
    return { label: 'Unknown', confined: false, text: 'The confinement status is not available in this build.' }
  }
  switch (status.state) {
    case 'not-needed':
      return { label: 'Landlock', confined: true, text: 'Commands are confined by the Linux kernel (Landlock): they can write only inside the project folder and the temporary folder.' }
    case 'ready':
      return { label: 'Confined', confined: true, text: 'Commands run inside a sandbox: they can write only inside the project folder and the temporary folder, cannot read SSH, cloud or GPG keys, and can reach only common code hosts and package registries.' }
    case 'needs-setup':
      return { label: 'Not confined', confined: false, text: `Commands currently run with your full user rights. Windows support for this sandbox is alpha and is not set up automatically: to try it, run "${WINDOWS_SETUP_COMMAND}" in a terminal (one administrator prompt), then restart SeshatOS. For a confinement that is known to work, choose Isolated (Docker) above.` }
    default:
      return { label: 'Not confined', confined: false, text: 'Commands currently run with your full user rights: the confinement component could not start on this machine. Choose Isolated (Docker) above for a confined run.' }
  }
}
