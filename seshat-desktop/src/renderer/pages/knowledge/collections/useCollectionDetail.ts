import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCollection, isIndexingConfigured, listFiles, listJobs, type Collection, type CollectionFile, type IndexingJob } from './collectionsApi'
import { fileState, isInProgress, quotaPause } from './fileStatus'

const WATCH_INTERVAL_MS = 2000

/** One collection with its documents and indexing jobs, watched while some document is still being indexed. */
export function useCollectionDetail(id: string) {
  const [collection, setCollection] = useState<Collection | null>(null)
  const [files, setFiles] = useState<CollectionFile[]>([])
  const [jobs, setJobs] = useState<IndexingJob[]>([])
  const [indexingConfigured, setIndexingConfigured] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const current = useRef(id)
  current.current = id

  const reload = useCallback(async () => {
    try {
      const [next, nextFiles, nextJobs] = await Promise.all([getCollection(id), listFiles(id), listJobs(id).catch(() => [] as IndexingJob[])])
      if (current.current !== id) return
      setCollection(next)
      setFiles(nextFiles)
      setJobs(nextJobs)
      setFailed(false)
    } catch {
      if (current.current === id) setFailed(true)
    } finally {
      if (current.current === id) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    setCollection(null)
    setFiles([])
    setJobs([])
    void reload()
    void isIndexingConfigured().then(setIndexingConfigured)
  }, [reload])

  const jobOf = useMemo(() => {
    const byFile = new Map<string, IndexingJob>()
    for (const job of jobs) {
      const known = byFile.get(job.fileId)
      if (!known || job.createdAt >= known.createdAt) byFile.set(job.fileId, job)
    }
    return (fileId: string) => byFile.get(fileId)
  }, [jobs])

  const watching = files.some((file) => isInProgress(file, fileState(file, jobOf(file.fileId))))
  useEffect(() => {
    if (!watching) return
    const timer = window.setInterval(() => void reload(), WATCH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [watching, reload])

  const pause = useMemo(() => quotaPause(jobs), [jobs])

  return { collection, files, jobOf, pause, indexingConfigured, loading, failed, reload }
}
