import type { RAGSearchResult } from '@renderer/api/types'
import { EmptyState } from './EmptyState'
import { useTranslation } from 'react-i18next'

type Props = {
  results: RAGSearchResult[]
}

export function KnowledgePanel({ results }: Props) {
  const { t } = useTranslation('chat')
  if (results.length === 0) {
    return (
      <EmptyState
        title={t('chat.panels.knowledgePanel.knowledgeContext')}
        description={t('chat.panels.knowledgePanel.retrievedKnowledgeExcerptsWillAppear')}
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
            <span className="block text-[var(--font-size-sm)] font-bold text-app-text">{filename || t('chat.panels.knowledgePanel.excerpt', { n: index + 1 })}</span>
            {score && <span className="mt-1 block text-[var(--font-size-2xs)] font-semibold uppercase tracking-[0.06em] text-app-text-muted">{t('chat.panels.knowledgePanel.relevance', { score })}</span>}
            <p className="mt-1.5 text-[var(--font-size-sm)] leading-relaxed text-app-text-secondary">{result.text}</p>
          </div>
        )
      })}
    </div>
  )
}
