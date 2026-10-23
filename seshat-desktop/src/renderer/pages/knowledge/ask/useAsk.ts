import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnswerLimits, AskScope, KnowledgeApi, SourceRef } from '../data/types'

export type TurnPhase = 'searching' | 'writing' | 'done' | 'error'

export type Turn = {
  id: string
  question: string
  scope: AskScope
  phase: TurnPhase
  collectionsSearched: number
  sources: SourceRef[]
  text: string
  limits: AnswerLimits | null
  error?: string
}

// The conversation of the Ask page: each question becomes a turn that goes from searching to writing to done as the events arrive.
export function useAsk(api: KnowledgeApi) {
  const [turns, setTurns] = useState<Turn[]>([])
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const patch = useCallback((id: string, change: (turn: Turn) => Partial<Turn>) => {
    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, ...change(turn) } : turn)))
  }, [])

  const ask = useCallback(
    async (question: string, scope: AskScope) => {
      const text = question.trim()
      if (!text) return
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      const id = crypto.randomUUID()
      setTurns((current) => [...current, { id, question: text, scope, phase: 'searching', collectionsSearched: 0, sources: [], text: '', limits: null }])
      try {
        for await (const event of api.ask({ question: text, scope }, controller.signal)) {
          if (event.type === 'searching') patch(id, () => ({ collectionsSearched: event.collections }))
          else if (event.type === 'sources') patch(id, () => ({ sources: event.sources, phase: 'writing' }))
          else if (event.type === 'text') patch(id, (turn) => ({ text: turn.text + event.delta }))
          else patch(id, () => ({ phase: 'done', limits: event.limits }))
        }
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') {
          patch(id, () => ({ phase: 'done' }))
          return
        }
        patch(id, () => ({ phase: 'error', error: (error as { message?: string }).message ?? 'The question could not be answered.' }))
      }
    },
    [api, patch]
  )

  const stop = useCallback(() => abort.current?.abort(), [])

  const reset = useCallback(() => {
    abort.current?.abort()
    setTurns([])
  }, [])

  const last = turns.at(-1)
  const busy = last?.phase === 'searching' || last?.phase === 'writing'

  return { turns, busy, ask, stop, reset }
}
