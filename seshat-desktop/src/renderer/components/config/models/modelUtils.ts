import type { ProviderModel, ProviderSetting } from '../providers/providerTypes'

export type ModelChoice = {
  id: string
  provider: ProviderSetting
  model: ProviderModel
  selected: boolean
}

export function buildModelChoices(settings: ProviderSetting[], modelsByProvider: Record<string, ProviderModel[]>): ModelChoice[] {
  return settings.flatMap((provider) => {
    const models = modelsByProvider[provider.id] ?? []
    const selectedModelId = provider.model_id || models.find((model) => model.is_default)?.model_id
    return models.map((model) => ({
      id: `${provider.id}:${model.id}`,
      provider,
      model,
      selected: model.model_id === selectedModelId
    }))
  })
}

export function getSelectedModel(provider: ProviderSetting, models: ProviderModel[]) {
  return models.find((model) => model.model_id === provider.model_id) ?? models.find((model) => model.is_default) ?? models[0] ?? null
}

export function formatTokens(value: number) {
  if (!value) return 'Unknown'
  if (value >= 1000000) return `${Math.round(value / 1000000)}M`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return value.toLocaleString()
}

export function formatModelSource(source: ProviderModel['source']) {
  return source === 'user' ? 'Custom' : 'Catalog'
}
