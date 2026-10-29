import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'

export type KnowledgeCollection = {
  id: string
  name: string
  documentCount: number | null
}

// Where a question looks: every collection the person can read, or one.
export type AskScope = { collectionId: string | null }

type CorpusRow = { id: string; name: string; file_count?: number }

// The collections the person can read, from the backend: the local ones, or the organization's when it is connected.
export function useCollections(): { collections: KnowledgeCollection[]; loading: boolean; failed: boolean; reload: () => void } {
  const [collections, setCollections] = useState<KnowledgeCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Bumped to read the collections again (after a failure).
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)
    api
      .get<{ corpora?: CorpusRow[] }>('/corpora')
      .then((data) => {
        if (cancelled) return
        setCollections((data.corpora ?? []).map((row) => ({ id: row.id, name: row.name, documentCount: typeof row.file_count === 'number' ? row.file_count : null })))
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [attempt])

  return { collections, loading, failed, reload: () => setAttempt((value) => value + 1) }
}
