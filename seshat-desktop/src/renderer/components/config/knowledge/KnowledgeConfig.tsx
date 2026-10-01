import { useCallback, useEffect, useState } from 'react'
import { DocumentReaderCard } from './DocumentReaderCard'
import { EmbedderCard } from './EmbedderCard'
import { KnowledgeStatus } from './KnowledgeStatus'
import { RerankerCard } from './RerankerCard'
import { StorageAndCorporaCard } from './StorageAndCorporaCard'
import { fetchKnowledgeSnapshot, type KnowledgeSnapshot } from './knowledgeApi'
import type { SystemStatus } from './knowledgeTypes'

type KnowledgePage = 'overview' | 'retrieval' | 'documents'

const emptySnapshot: KnowledgeSnapshot = {
  corpora: [],
  embedder: null,
  reranker: null,
  documentReader: null,
  storage: null,
  system: null
}

export function KnowledgeConfig() {
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot>(emptySnapshot)
  const [activePage, setActivePage] = useState<KnowledgePage>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const next = await fetchKnowledgeSnapshot()
      setSnapshot(next)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to load knowledge configuration.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] p-1">
          {knowledgePages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setActivePage(page.id)}
              className={[
                'h-8 rounded px-3 text-[12px] font-semibold transition-colors',
                activePage === page.id
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              ].join(' ')}
            >
              {page.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-panel)]"
        >
          Refresh
        </button>
      </div>
      {loading && <div className="text-[12px] font-semibold text-[var(--text-muted)]">Loading...</div>}

      {error && (
        <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
          {error}
        </div>
      )}

      {activePage === 'overview' && (
        <>
          <KnowledgeStatus
            corpora={snapshot.corpora}
            embedder={snapshot.embedder}
            reranker={snapshot.reranker}
            documentReader={snapshot.documentReader}
            storage={snapshot.storage}
            system={snapshot.system}
          />
          <StorageAndCorporaCard storage={snapshot.storage} corpora={snapshot.corpora} />
        </>
      )}

      {activePage === 'retrieval' && (
        <>
          <EmbedderCard config={snapshot.embedder} onSaved={(embedder) => setSnapshot((current) => ({ ...current, embedder }))} />
          <RerankerCard config={snapshot.reranker} onSaved={(reranker) => setSnapshot((current) => ({ ...current, reranker }))} />
        </>
      )}

      {activePage === 'documents' && (
        <DocumentReaderCard
          config={snapshot.documentReader}
          system={snapshot.system}
          onSaved={(documentReader) => setSnapshot((current) => ({ ...current, documentReader }))}
          onSystemChanged={(system) =>
            setSnapshot((current) => ({
              ...current,
              system: current.system ? { ...current.system, ...system } : ({ mode: 'standalone', ...system } as SystemStatus)
            }))
          }
        />
      )}
    </div>
  )
}

const knowledgePages: Array<{ id: KnowledgePage; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'retrieval', label: 'Retrieval' },
  { id: 'documents', label: 'Documents' }
]
