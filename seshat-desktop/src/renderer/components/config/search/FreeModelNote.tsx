// What a free model of OpenRouter costs in limits: free models carry ":free" at the end of their id, and the service allows 50 requests a
// day on them (1,000 once the account holds credits). Enough to try a model, not to index a collection, and a reranker would use one
// request per search.
export function isFreeModel(model: string): boolean {
  return model.trim().endsWith(':free')
}

export function FreeModelNote({ what }: { what: 'embedding' | 'rerank' }) {
  return (
    <div className="px-4 py-3 text-[12px] text-[var(--text-muted)]">
      Free models are limited to 50 requests a day. {what === 'embedding' ? 'Fine to try, not to index a collection.' : 'Each search uses one: pick a paid model for daily use.'}
    </div>
  )
}
