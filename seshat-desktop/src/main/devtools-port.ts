import { readFile } from 'fs/promises'

const WAIT_MS = 3000
const POLL_MS = 50

/** The port Chromium wrote on the first line of DevToolsActivePort once its debugging server listens, or 0 if none came in time. */
export function parseDevToolsPort(content: string): number {
  const port = Number.parseInt(content.split('\n')[0]?.trim() ?? '', 10)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 0
}

export async function readDevToolsPort(file: string, waitMs = WAIT_MS): Promise<number> {
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    const port = parseDevToolsPort(await readFile(file, 'utf8').catch(() => ''))
    if (port > 0) return port
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  return 0
}
