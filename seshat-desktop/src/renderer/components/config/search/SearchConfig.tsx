import { useCallback, useEffect, useState } from 'react'
import { useProviders } from '@renderer/hooks/useProviders'
import { useProvidersStore } from '@renderer/stores/providers'
import { api } from '@renderer/api/client'
import type { EmbedderConfig, RerankerConfig } from '../knowledge/knowledgeTypes'
import { Notice, SettingsPage } from '../../settings/kit'
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
    <SettingsPage id="search">
      {error && <Notice tone="error">{error}</Notice>}
      {!loading && !error && (
        <>
          <EmbedderCard config={embedder} providers={providers} onSaved={setEmbedder} />
          <RerankerCard config={reranker} providers={providers} onSaved={setReranker} />
        </>
      )}
    </SettingsPage>
  )
}
