import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { Corpus } from '@renderer/api/types'

// One shared in-flight/settled lookup for every tool card that shows a
// corpus, so a conversation with many knowledge searches doesn't issue one
// GET /corpora per card. Failure clears the cache so a later mount retries.
let corporaPromise: Promise<Corpus[]> | null = null

function loadCorpora(): Promise<Corpus[]> {
  if (!corporaPromise) {
    corporaPromise = api.get<{ corpora: Corpus[] }>('/corpora')
      .then((response) => response.corpora ?? [])
      .catch((error) => {
        corporaPromise = null
        throw error
      })
  }
  return corporaPromise
}

// Resolves a corpus id to its display name; undefined while loading or if the
// corpus no longer exists/can't be fetched (callers fall back to the id).
export function useCorpusName(corpusId: string): string | undefined {
  const [name, setName] = useState<string | undefined>()

  useEffect(() => {
    if (!corpusId) return
    let cancelled = false
    loadCorpora()
      .then((corpora) => {
        if (!cancelled) setName(corpora.find((corpus) => corpus.id === corpusId)?.name)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [corpusId])

  return name
}
