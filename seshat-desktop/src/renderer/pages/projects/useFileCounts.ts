import { useEffect, useState } from 'react'

export type FileCount = { count: number; capped: boolean }

// What was counted stays for the length of the session: a project card should not count its folder again each time the page is opened.
const known = new Map<string, FileCount>()
const MAX_AT_ONCE = 2

/**
 * The number of files of each project folder, as it is learnt: the page shows what it has and fills the rest in. The folders are
 * counted a couple at a time, so that a page of many projects does not read a disk all at once.
 */
export function useFileCounts(paths: string[]): Record<string, FileCount> {
  const [counts, setCounts] = useState<Record<string, FileCount>>(() => Object.fromEntries(known))
  const key = paths.join('\n')

  useEffect(() => {
    const count = window.seshat?.fs?.countFiles
    if (!count) return
    let cancelled = false
    const queue = paths.filter((path) => !known.has(path))
    async function worker() {
      for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
        try {
          const result = await count!(path)
          known.set(path, result)
          if (!cancelled) setCounts((current) => ({ ...current, [path]: result }))
        } catch {
          // a folder that moved or cannot be read has no number, which the card says with a dash
        }
      }
    }
    for (let i = 0; i < MAX_AT_ONCE; i++) void worker()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return counts
}
