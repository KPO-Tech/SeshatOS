import { useEffect, useState } from 'react'
import { sampleKnowledgeApi } from './sampleApi'
import type { KnowledgeApi, KnowledgeCollection, KnowledgeDocument } from './types'

// The one place the Knowledge pages get their data. Until they are connected to SeshatCloud this is the sample implementation.
export function useKnowledgeApi(): KnowledgeApi {
  return sampleKnowledgeApi
}

export function useCollections(api: KnowledgeApi): KnowledgeCollection[] {
  const [collections, setCollections] = useState<KnowledgeCollection[]>([])
  useEffect(() => {
    let cancelled = false
    void api.listCollections().then((items) => {
      if (!cancelled) setCollections(items)
    })
    return () => {
      cancelled = true
    }
  }, [api])
  return collections
}

// The documents behind a list of ids, loaded once each and kept.
export function useDocuments(api: KnowledgeApi, ids: readonly string[]): Record<string, KnowledgeDocument> {
  const [documents, setDocuments] = useState<Record<string, KnowledgeDocument>>({})
  const key = ids.join('|')
  useEffect(() => {
    const missing = ids.filter((id) => !documents[id])
    if (missing.length === 0) return
    let cancelled = false
    void Promise.all(missing.map((id) => api.getDocument(id))).then((loaded) => {
      if (cancelled) return
      setDocuments((current) => {
        const next = { ...current }
        for (const doc of loaded) if (doc) next[doc.id] = doc
        return next
      })
    })
    return () => {
      cancelled = true
    }
    // The ids are compared by value through `key`.
  }, [api, key])
  return documents
}
