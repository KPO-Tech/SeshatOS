import { useCallback, useEffect, useState } from 'react'
import { fetchKnowledgeSnapshot, type KnowledgeSnapshot } from '@renderer/components/config/knowledge/knowledgeApi'
import { EmbedderCard } from './EmbedderCard'
import { KnowledgeStatus } from './KnowledgeStatus'
import { RerankerCard } from './RerankerCard'
import { StorageAndCorporaCard } from './StorageAndCorporaCard'

const emptySnapshot: KnowledgeSnapshot = {
  corpora: [],
  embedder: null,
  reranker: null,
  documentReader: null,
  storage: null,
  system: null
}

// What Knowledge searches with and where it keeps its data: the embedding and reranking models, the storage and the collections. Nothing
// else in the app uses these models (the reading of documents, which the chat uses too, is in Config > Documents), so they live here.
export function SettingsPage() {
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setSnapshot(await fetchKnowledgeSnapshot())
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to load the Knowledge settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-10">
      <div className="mx-auto w-full max-w-[880px]" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-[30px] font-normal leading-[1.15] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
              Settings
            </h1>
            <p className="mb-0 mt-2 text-[13.5px] leading-[21px] text-[var(--text-muted)]">The models Knowledge searches with, and where it keeps its data.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-panel)]"
          >
            Refresh
          </button>
        </div>

        <div className="mt-7 grid gap-4">
          {loading && <div className="text-[12px] font-semibold text-[var(--text-muted)]">Loading...</div>}

          {error && (
            <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
              {error}
            </div>
          )}

          <KnowledgeStatus
            corpora={snapshot.corpora}
            embedder={snapshot.embedder}
            reranker={snapshot.reranker}
            documentReader={snapshot.documentReader}
            storage={snapshot.storage}
            system={snapshot.system}
          />
          <EmbedderCard config={snapshot.embedder} onSaved={(embedder) => setSnapshot((current) => ({ ...current, embedder }))} />
          <RerankerCard config={snapshot.reranker} onSaved={(reranker) => setSnapshot((current) => ({ ...current, reranker }))} />
          <StorageAndCorporaCard storage={snapshot.storage} corpora={snapshot.corpora} />
        </div>
      </div>
    </div>
  )
}
