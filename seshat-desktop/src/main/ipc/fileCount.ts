import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export type FileCount = {
  count: number
  /** True when the count stopped at the limit: there are at least this many files. */
  capped: boolean
}

// Folders that hold what a tool made and not what the person works on: counting them would say a lot about node_modules and nothing
// about the project.
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.next', '.cache', 'dist', 'build', 'target', '.idea', '.vscode'])

export const DEFAULT_COUNT_LIMIT = 5000
const MAX_DEPTH = 8

/**
 * How many files a project folder holds, for the card of the Projects page. It is bounded on purpose (a limit of files, a depth, no link
 * followed, no tool folder), because a project can sit on a whole disk: a number that stops at "5000+" is enough to tell a small project
 * from a big one, and the page must not wait for a folder of a million files.
 */
export async function countFiles(root: string, limit = DEFAULT_COUNT_LIMIT): Promise<FileCount> {
  let count = 0
  let level = [root]
  for (let depth = 0; level.length > 0 && depth <= MAX_DEPTH; depth++) {
    const next: string[] = []
    for (const directory of level) {
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        continue // a folder that cannot be read is left out, not an error of the whole count
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIPPED_FOLDERS.has(entry.name)) next.push(join(directory, entry.name))
        } else if (entry.isFile()) {
          count += 1
          if (count >= limit) return { count: limit, capped: true }
        }
      }
    }
    level = next
  }
  return { count, capped: false }
}
