import type { Corpus, DocumentReaderConfig, EmbedderConfig, RerankerConfig, StorageStatus, SystemStatus } from './knowledgeTypes'

export function KnowledgeStatus({ corpora, embedder, reranker, documentReader, storage, system }: {
  corpora: Corpus[]
  embedder: EmbedderConfig | null
  reranker: RerankerConfig | null
  documentReader: DocumentReaderConfig | null
  storage: StorageStatus | null
  system: SystemStatus | null
}) {
  const chunks = corpora.reduce((total, corpus) => total + (corpus.chunk_count ?? 0), 0)
  const externalConfigured = system?.document_external_configured ?? Boolean(documentReader?.enabled && documentReader.base_url)
  const externalReachable = system?.document_reader_reachable
  const hybridConfigured = system?.document_hybrid_chunking_configured ?? externalConfigured
  const externalReaderDetail = externalReachable === true ? 'External reachable' : externalReachable === false ? 'External check failed' : externalConfigured ? 'External configured' : 'Local readers'
  const pdfSmartAvailable = system?.document_pdfsmart_available ?? system?.document_conversion_available !== false
  const nativeDocReady = system?.document_nativedoc_ready === true
  const localDocumentDetail = nativeDocReady ? 'PDF smart + native OCR' : pdfSmartAvailable ? 'PDF smart local' : externalReaderDetail
  const items = [
    {
      label: 'Embedding',
      value: embedder?.is_configured ? 'Ready' : 'Review',
      detail: embedder?.model || 'No model selected',
      tone: embedder?.is_configured ? 'text-[var(--accent-success)]' : 'text-[var(--accent-primary)]'
    },
    {
      label: 'Reranker',
      value: reranker?.is_configured ? 'Ready' : 'Off',
      detail: reranker?.model || 'Optional',
      tone: reranker?.is_configured ? 'text-[var(--accent-success)]' : 'text-[var(--text-primary)]'
    },
    {
      label: 'Document read',
      value: system?.document_conversion_available === false ? 'Review' : 'Local',
      detail: localDocumentDetail,
      tone: system?.document_conversion_available === false ? 'text-[var(--accent-danger)]' : 'text-[var(--accent-success)]'
    },
    {
      label: 'Hybrid chunks',
      value: hybridConfigured ? 'Ready' : 'Local',
      detail: hybridConfigured ? 'Document-aware chunks' : system?.document_hybrid_chunking_error || 'Structured fallback',
      tone: hybridConfigured ? 'text-[var(--accent-success)]' : 'text-[var(--text-primary)]'
    },
    {
      label: 'Knowledge',
      value: String(corpora.length),
      detail: `${chunks} chunks`,
      tone: 'text-[var(--text-primary)]'
    },
    {
      label: 'Storage',
      value: storage?.active_provider || 'local',
      detail: storage?.restart_required ? 'Restart required' : 'Active',
      tone: storage?.restart_required ? 'text-[var(--accent-primary)]' : 'text-[var(--accent-success)]'
    }
  ]

  return (
    <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
      {items.map((item) => (
        <article key={item.label} className="min-w-0 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[11px] font-semibold text-[var(--text-muted)]">{item.label}</div>
            <span className={['size-1.5 rounded-full', item.tone.includes('success') ? 'bg-[var(--accent-success)]' : item.tone.includes('primary') ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-faint)]'].join(' ')} />
          </div>
          <div className={['mt-1.5 truncate text-[16px] font-semibold leading-none', item.tone].join(' ')}>{item.value}</div>
          <div className="mt-1.5 truncate text-[11px] text-[var(--text-muted)]">{item.detail}</div>
        </article>
      ))}
    </section>
  )
}
