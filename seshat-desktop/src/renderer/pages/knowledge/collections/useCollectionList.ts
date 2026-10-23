import { useCallback, useEffect, useState } from 'react'
import { isIndexingConfigured, listCollections, type Collection } from './collectionsApi'

export function useCollectionList() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [indexingConfigured, setIndexingConfigured] = useState<boolean | null>(null)

  const reload = useCallback(async () => {
    try {
      setCollections(await listCollections())
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

  return { collections, loading, failed, indexingConfigured, reload }
}
