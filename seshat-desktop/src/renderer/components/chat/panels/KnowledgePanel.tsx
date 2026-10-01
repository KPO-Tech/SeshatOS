import type { RAGSearchResult } from '@renderer/api/types'
import { EmptyState } from './EmptyState'

type Props = {
  results: RAGSearchResult[]
}

export function KnowledgePanel({ results }: Props) {
  if (results.length === 0) {
    return (
      <EmptyState
        title="Knowledge context"
        description="Retrieved knowledge excerpts will appear here when a conversation is attached to a corpus."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {results.map((result, index) => {
        const filename = result.metadata?.filename
        const score = Number.isFinite(result.score) ? result.score.toFixed(3) : null
        return (
          <div key={result.key || String(index)} className="rounded-app-md border border-app-border-subtle bg-app-bg p-2.5">
            <span className="block text-[var(--font-size-sm)] font-bold text-app-text">{filename || `Excerpt ${index + 1}`}</span>
            {score && <span className="mt-1 block text-[var(--font-size-2xs)] font-semibold uppercase tracking-[0.06em] text-app-text-muted">Relevance {score}</span>}
            <p className="mt-1.5 text-[var(--font-size-sm)] leading-relaxed text-app-text-secondary">{result.text}</p>
          </div>
        )
      })}
    </div>
  )
}
