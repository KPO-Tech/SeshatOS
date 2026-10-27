import { useCallback, useRef, useState } from 'react'
import { searchPassages } from './searchApi'
import type { Hit } from './searchModel'

export type SearchState =
  | { phase: 'idle' }
  | { phase: 'loading'; query: string }
  | { phase: 'done'; query: string; hits: Hit[]; collectionsSearched: number }
  | { phase: 'failed'; query: string }

export function useSearch() {
  const [state, setState] = useState<SearchState>({ phase: 'idle' })
  const latest = useRef(0)

  const run = useCallback(async (query: string, collectionId: string | null) => {
    const text = query.trim()
    if (!text) return
    const id = (latest.current += 1)
    setState({ phase: 'loading', query: text })
    try {
      const outcome = await searchPassages(text, collectionId)
      if (id === latest.current) setState({ phase: 'done', query: text, ...outcome })
    } catch {
      if (id === latest.current) setState({ phase: 'failed', query: text })
    }
  }, [])

  return { state, run }
}
