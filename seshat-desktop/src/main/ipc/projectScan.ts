import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

// Folders that hold what a tool made and not what the person works on (see fileCount.ts, which keeps the same list for the same reason).
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.next', '.cache', 'dist', 'build', 'target', '.idea', '.vscode'])

const MAX_DEPTH = 8
export const SCAN_FILE_LIMIT = 5000
const SEARCH_ENTRY_LIMIT = 20000
const SEARCH_RESULT_LIMIT = 100
const STAT_BATCH = 32

export type RecentFile = { path: string; name: string; modifiedMs: number }

export type ProjectScan = {
  count: number
  /** True when the scan stopped at the limit: there are at least `count` files and `bytes` is what the files seen weigh. */
  capped: boolean
  bytes: number
  /** The files changed last, newest first. */
  recent: RecentFile[]
  /** When the folder was created (its birth time), or 0 when the system does not say. */
  createdMs: number
}

/**
 * What the page of a project says about its folder: how many files, how much they weigh, which ones changed last, and when it was made.
 * Bounded like the count of a card (a limit of files, a depth, no link followed, no tool folder): the page must answer at once for a
 * project that sits on a whole disk.
 */
export async function scanProject(root: string, recentLimit = 5, limit = SCAN_FILE_LIMIT): Promise<ProjectScan> {
  const result: ProjectScan = { count: 0, capped: false, bytes: 0, recent: [], createdMs: 0 }
  try {
    const info = await stat(root)
    result.createdMs = info.birthtimeMs > 0 ? info.birthtimeMs : 0
  } catch {
    return result
  }

  let level = [root]
  for (let depth = 0; level.length > 0 && depth <= MAX_DEPTH && !result.capped; depth++) {
    const next: string[] = []
    for (const directory of level) {
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        continue
      }
      const files: string[] = []
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIPPED_FOLDERS.has(entry.name)) next.push(join(directory, entry.name))
        } else if (entry.isFile()) {
          files.push(entry.name)
        }
      }
      for (let start = 0; start < files.length; start += STAT_BATCH) {
        const batch = files.slice(start, start + STAT_BATCH)
        const infos = await Promise.all(batch.map((name) => stat(join(directory, name)).then((info) => ({ name, info }), () => null)))
        for (const found of infos) {
          if (!found) continue
          result.count += 1
          result.bytes += found.info.size
          keepRecent(result.recent, { path: join(directory, found.name), name: found.name, modifiedMs: found.info.mtimeMs }, recentLimit)
          if (result.count >= limit) {
            result.capped = true
            return result
          }
        }
      }
    }
    level = next
  }
  return result
}

function keepRecent(list: RecentFile[], file: RecentFile, limit: number) {
  if (limit <= 0) return
  if (list.length >= limit && file.modifiedMs <= list[list.length - 1].modifiedMs) return
  list.push(file)
  list.sort((a, b) => b.modifiedMs - a.modifiedMs)
  if (list.length > limit) list.length = limit
}

export type FoundFile = { path: string; relativePath: string; name: string; isDirectory: boolean }

/**
 * The files and folders of a project whose name holds a word, for the search of the tree. It reads at most 20 000 entries and gives at
 * most 100 results, closest to the root first, so that a search in a very big folder still answers at once.
 */
export async function searchFiles(root: string, query: string, limit = SEARCH_RESULT_LIMIT): Promise<FoundFile[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const found: FoundFile[] = []
  let seen = 0
  let level = [root]
  for (let depth = 0; level.length > 0 && depth <= MAX_DEPTH; depth++) {
    const next: string[] = []
    for (const directory of level) {
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        continue
      }
      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      for (const entry of entries) {
        const isDirectory = entry.isDirectory()
        if (!isDirectory && !entry.isFile()) continue
        seen += 1
        if (seen > SEARCH_ENTRY_LIMIT) return found
        const lower = entry.name.toLowerCase()
        if (words.every((word) => lower.includes(word))) {
          const path = join(directory, entry.name)
          found.push({ path, relativePath: relative(root, path), name: entry.name, isDirectory })
          if (found.length >= limit) return found
        }
        if (isDirectory && !SKIPPED_FOLDERS.has(entry.name)) next.push(join(directory, entry.name))
      }
    }
    level = next
  }
  return found
}
