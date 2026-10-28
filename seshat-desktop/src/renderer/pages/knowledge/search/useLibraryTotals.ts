import { useEffect, useState } from 'react'
import { fetchDocuments } from './libraryApi'
import { KIND_ORDER } from './searchModel'
import type { FileKind } from '../chat/passageSources'

// The kinds of document in the whole library, with how many of each: what the list of kinds on the left always shows, whatever is
// searched or narrowed down. Read once, with one document, since only the counts are wanted.
export function useLibraryTotals(): { kinds: { kind: FileKind; count: number }[]; total: number } {
  const [totals, setTotals] = useState<{ kinds: { kind: FileKind; count: number }[]; total: number }>({ kinds: [], total: 0 })

  useEffect(() => {
    let cancelled = false
    fetchDocuments({ limit: 1 })
      .then((page) => {
        if (cancelled) return
        const kinds = KIND_ORDER.filter((kind) => (page.kinds[kind] ?? 0) > 0).map((kind) => ({ kind, count: page.kinds[kind] ?? 0 }))
        setTotals({ kinds, total: page.total })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return totals
}
