import { useTranslation } from 'react-i18next'
// What a free model of OpenRouter costs in limits: free models carry ":free" at the end of their id, and the service allows 50 requests a
// day on them (1,000 once the account holds credits). Enough to try a model, not to index a collection, and a reranker would use one
// request per search.
export function isFreeModel(model: string): boolean {
  return model.trim().endsWith(':free')
}

export function FreeModelNote({ what }: { what: 'embedding' | 'rerank' }) {
  const { t } = useTranslation('config')
  return (
    <div className="px-4 py-3 text-[12px] text-[var(--text-muted)]">
      {t('search.freeModelNote.limited')} {what === 'embedding' ? t('search.freeModelNote.fineToTryNotTo') : t('search.freeModelNote.eachSearchUsesOnePick')}
    </div>
  )
}
