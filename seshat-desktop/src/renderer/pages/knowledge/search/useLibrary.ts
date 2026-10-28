import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileKind } from '../chat/passageSources'
import { fetchDocuments, type DocumentsPage } from './libraryApi'
import type { Doc } from './searchModel'

const PAGE = 40

export type Library = {
  docs: Doc[]
  total: number
  collections: DocumentsPage['collections']
  kinds: DocumentsPage['kinds']
  loading: boolean
  failed: boolean
  hasMore: boolean
  loadMore: () => void
}

type Params = { corpusIds: readonly string[]; kind: FileKind | null; sort: 'recent' | 'name'; enabled: boolean }

// The indexed documents, a page at a time: the first page when the choice changes, the next one when the list is scrolled to its end.
// Only the pages asked for are read, so the cost does not grow with the number of documents.
export function useLibrary({ corpusIds, kind, sort, enabled }: Params): Library {
  const [docs, setDocs] = useState<Doc[]>([])
  const [total, setTotal] = useState(0)
  const [collections, setCollections] = useState<DocumentsPage['collections']>([])
  const [kinds, setKinds] = useState<DocumentsPage['kinds']>({})
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const latest = useRef(0)
  const loadingMore = useRef(false)
  // The ids, as a string, so that a new array with the same ids does not read the first page again.
  const idsKey = corpusIds.join('\u0001')

  useEffect(() => {
    if (!enabled) return
    const id = (latest.current += 1)
    loadingMore.current = false
    setLoading(true)
    fetchDocuments({ corpusIds: idsKey ? idsKey.split('\u0001') : [], kind, sort, limit: PAGE, offset: 0 })
      .then((page) => {
        if (id !== latest.current) return
        setDocs(page.docs)
        setTotal(page.total)
        setCollections(page.collections)
        setKinds(page.kinds)
        setFailed(false)
      })
      .catch(() => id === latest.current && setFailed(true))
      .finally(() => id === latest.current && setLoading(false))
  }, [idsKey, kind, sort, enabled])

  const loadMore = useCallback(() => {
    if (loadingMore.current || loading || docs.length >= total) return
    loadingMore.current = true
    const id = latest.current
    fetchDocuments({ corpusIds: idsKey ? idsKey.split('\u0001') : [], kind, sort, limit: PAGE, offset: docs.length })
      .then((page) => {
        if (id !== latest.current) return
        setDocs((current) => {
          const seen = new Set(current.map((doc) => doc.key))
          return [...current, ...page.docs.filter((doc) => !seen.has(doc.key))]
        })
      })
      .catch(() => id === latest.current && setFailed(true))
      .finally(() => {
        loadingMore.current = false
      })
  }, [docs.length, total, loading, idsKey, kind, sort])

  return { docs, total, collections, kinds, loading, failed, hasMore: docs.length < total, loadMore }
}
