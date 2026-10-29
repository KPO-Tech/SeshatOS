import { useCallback, useEffect, useState } from 'react'
import { useProviders } from '@renderer/hooks/useProviders'
import { useProvidersStore } from '@renderer/stores/providers'
import { api } from '@renderer/api/client'
import type { EmbedderConfig, RerankerConfig } from '../knowledge/knowledgeTypes'
import { EmbedderCard } from './EmbedderCard'
import { RerankerCard } from './RerankerCard'

// How Knowledge searches: the model that turns passages and questions into vectors, and the optional one that reorders what was found.
// The providers of the person are read too, so that the models of a company they already use can take its key.
export function SearchConfig() {
  useProviders()
  const providers = useProvidersStore((state) => state.providers)
  const [embedder, setEmbedder] = useState<EmbedderConfig | null>(null)
  const [reranker, setReranker] = useState<RerankerConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [e, r] = await Promise.all([api.get<EmbedderConfig>('/settings/embedder'), api.get<RerankerConfig>('/settings/reranker')])
      setEmbedder(e)
      setReranker(r)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'The search settings could not be read.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="grid gap-4">
      {loading && <div className="text-[12px] font-semibold text-[var(--text-muted)]">Loading...</div>}
      {error && <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
      {!loading && !error && (
        <>
          <EmbedderCard config={embedder} providers={providers} onSaved={setEmbedder} />
          <RerankerCard config={reranker} providers={providers} onSaved={setReranker} />
        </>
      )}
    </div>
  )
}
