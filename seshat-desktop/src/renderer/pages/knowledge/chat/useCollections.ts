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
export function useCollections(): { collections: KnowledgeCollection[]; loading: boolean; failed: boolean } {
  const [collections, setCollections] = useState<KnowledgeCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
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
  }, [])

  return { collections, loading, failed }
}
