import { useEffect, useState } from 'react'
import { listCollections, listFiles } from '../collections/collectionsApi'
import { docOfFile, type Doc } from './searchModel'

// Every indexed document of every collection the person can read, listed, so the page shows them before anything is searched.
export function useLibrary(): { docs: Doc[]; loading: boolean; failed: boolean } {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const collections = await listCollections()
        const lists = await Promise.all(collections.map(async (collection) => (await listFiles(collection.id)).filter((file) => file.status === 'ingested').map((file) => docOfFile(collection, file))))
        if (!cancelled) setDocs(lists.flat())
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { docs, loading, failed }
}
