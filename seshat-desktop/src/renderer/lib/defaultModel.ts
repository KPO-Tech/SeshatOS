// Which model the app starts a conversation with. The person picks it in Config > Models: that sets the default provider and the model
// that provider uses, so every place that starts a conversation has to read those two and nothing else first.
type ProviderLike = { id: string; is_default: boolean; model_id?: string }
type ModelLike = { model_id: string; is_default: boolean }

/** The model a provider answers with: the one chosen for it, then the one its catalog marks as default, then the first. */
export function modelOfProvider<M extends ModelLike>(provider: Pick<ProviderLike, 'model_id'>, models: M[]): M | null {
  return (provider.model_id ? models.find((model) => model.model_id === provider.model_id) : undefined) ?? models.find((model) => model.is_default) ?? models[0] ?? null
}

/** The same pick over a flat list of choices (a provider id and a model each), as the chat composers hold them. */
export function pickDefaultChoice<P extends ProviderLike, C extends { providerId: string; model: ModelLike }>(providers: P[], choices: C[]): C | null {
  const picked = pickDefaultModel(providers, (provider) => choices.filter((choice) => choice.providerId === provider.id).map((choice) => choice.model))
  return picked ? choices.find((choice) => choice.providerId === picked.provider.id && choice.model === picked.model) ?? null : null
}

/** The default provider first, the others in their order; the first provider with a model gives the default. */
export function pickDefaultModel<P extends ProviderLike, M extends ModelLike>(providers: P[], modelsOf: (provider: P) => M[]): { provider: P; model: M } | null {
  const ordered = [...providers].sort((a, b) => Number(b.is_default) - Number(a.is_default))
  for (const provider of ordered) {
    const model = modelOfProvider(provider, modelsOf(provider))
    if (model) return { provider, model }
  }
  return null
}
