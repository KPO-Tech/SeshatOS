import { useCallback, useEffect, useState } from 'react'
import { isIndexingConfigured, listCollections, type Collection } from './collectionsApi'
import { listSources, type KnowledgeSource } from './sourcesApi'

export function useCollectionList() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [failed, setFailed] = useState(false)
  const [indexingConfigured, setIndexingConfigured] = useState<boolean | null>(null)

  const reload = useCallback(async () => {
    try {
      const [list, known] = await Promise.all([listCollections(), listSources().catch(() => ({ sources: [] as KnowledgeSource[], defaultCount: 0 }))])
      setCollections(list)
      setSources(known.sources)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    void isIndexingConfigured().then(setIndexingConfigured)
  }, [reload])

  return { collections, sources, loading, failed, indexingConfigured, reload }
}
