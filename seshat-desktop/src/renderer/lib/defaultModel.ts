// Which model the app starts a conversation with. The person picks it in Config > Models: that sets the default provider and the model
// that provider uses, so every place that starts a conversation has to read those two and nothing else first.
type ProviderLike = { id: string; is_default: boolean; model_id?: string }
type ModelLike = { model_id: string; is_default: boolean }

/** The model a provider answers with: the one chosen for it, then the one its catalog marks as default, then the first. */
export function modelOfProvider<M extends ModelLike>(provider: Pick<ProviderLike, 'model_id'>, models: M[]): M | null {
  return (provider.model_id ? models.find((model) => model.model_id === provider.model_id) : undefined) ?? models.find((model) => model.is_default) ?? models[0] ?? null
}

/**
 * The default model, but only once it is certain: while a provider that comes before the pick has not given its models yet (null), the
 * answer is null, because that provider could still be the one that gives it. Without this, the first catalog to arrive decided, and
 * the default changed with the order the providers answered in.
 */
export function pickDefaultChoiceWhenSettled<P extends ProviderLike, C extends { providerId: string; model: ModelLike }>(
  providers: P[],
  choices: C[],
  isLoaded: (provider: P) => boolean
): C | null {
  const ordered = [...providers].sort((a, b) => Number(b.is_default) - Number(a.is_default))
  for (const provider of ordered) {
    if (!isLoaded(provider)) return null
    const models = choices.filter((choice) => choice.providerId === provider.id).map((choice) => choice.model)
    const model = modelOfProvider(provider, models)
    if (model) return choices.find((choice) => choice.providerId === provider.id && choice.model === model) ?? null
  }
  return null
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
