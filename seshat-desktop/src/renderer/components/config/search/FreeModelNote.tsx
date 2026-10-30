// What a free model of OpenRouter costs in limits: free models carry ":free" at the end of their id, and the service allows 50 requests a
// day on them (1,000 once the account holds credits). Enough to try a model, not to index a collection, and a reranker would use one
// request per search.
export function isFreeModel(model: string): boolean {
  return model.trim().endsWith(':free')
}

export function FreeModelNote({ what }: { what: 'embedding' | 'rerank' }) {
  return (
    <p className="m-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] leading-[18px] text-[var(--text-muted)]">
      <span className="font-semibold text-[var(--text-secondary)]">Free models are limited to 50 requests a day</span> (1,000 with credits on the account).{' '}
      {what === 'embedding' ? 'That is enough to try one, not to index a collection: choose a model that is not free for that. They cost cents.' : 'Each search uses one, so the limit is soon reached: choose a model that is not free for daily use.'}
    </p>
  )
}
