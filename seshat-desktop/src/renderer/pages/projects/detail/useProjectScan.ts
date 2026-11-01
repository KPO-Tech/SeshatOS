import { useEffect, useState } from 'react'

export type Scan = { count: number; capped: boolean; bytes: number; recent: Array<{ path: string; name: string; modifiedMs: number }>; createdMs: number }

/** What the folder of a project holds, read in the background when the page opens and again when `refreshKey` changes. */
export function useProjectScan(rootPath: string, refreshKey: number): Scan | null {
  const [scan, setScan] = useState<Scan | null>(null)
  useEffect(() => {
    let current = true
    window.seshat?.fs
      ?.scanProject(rootPath)
      .then((result) => current && setScan(result))
      .catch(() => current && setScan(null))
    return () => {
      current = false
    }
  }, [rootPath, refreshKey])
  return scan
}
