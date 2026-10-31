import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

type Environment = Record<string, string | undefined>

/** Where Visual Studio Code is installed, for a system, most likely first. A command on the path is tried after these. */
export function vsCodeLocations(platform: NodeJS.Platform, env: Environment): string[] {
  if (platform === 'win32') {
    const roots = [env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)']].filter((root): root is string => Boolean(root))
    return roots.map((root) => join(root, 'Microsoft VS Code', 'Code.exe'))
  }
  if (platform === 'darwin') return ['/Applications/Visual Studio Code.app']
  return []
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function launch(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    // No shell: the folder is an argument, never part of a command line that something could read as more.
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('error', () => resolve(false))
    child.once('spawn', () => {
      child.unref()
      resolve(true)
    })
  })
}

/** Opens a folder in Visual Studio Code. Returns false when it is not installed (the caller says so and offers the folder instead). */
export async function openInVSCode(directory: string, platform: NodeJS.Platform = process.platform, env: Environment = process.env): Promise<boolean> {
  for (const location of vsCodeLocations(platform, env)) {
    if (!(await exists(location))) continue
    if (platform === 'darwin') return launch('open', ['-a', location, directory])
    return launch(location, [directory])
  }
  // Linux, or an install that is only known by its command: `code` on the path.
  return launch('code', [directory])
}
