import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { EmbedderState } from './askReadiness'

/** The embedding settings Ask warns about, or null while unknown or when they could not be read (nothing is said then). */
export function useEmbedderState(): EmbedderState | null {
  const [state, setState] = useState<EmbedderState | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .get<EmbedderState>('/settings/embedder')
      .then((config) => !cancelled && setState({ enabled: Boolean(config.enabled), is_configured: Boolean(config.is_configured), vectors_stale: Boolean(config.vectors_stale) }))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return state
}
