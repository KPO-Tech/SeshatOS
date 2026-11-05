import { useMemo } from 'react'
import { Notice, SettingsPage, StatusBadge } from '../../settings/kit'
import { CapabilitySourceCard } from './CapabilitySourceCard'
import { useCapabilityOptions } from './capabilityOptions'
import { OptionsCard, type OptionDefinition } from './OptionsCard'
import { useCapabilities } from './useCapabilities'
import { useTranslation } from 'react-i18next'

// Gemini and OpenRouter shape an image with an aspect ratio; the OpenAI image API and the servers that copy it take a size and a quality.
const RATIO_PROVIDERS = new Set(['gemini', 'openrouter'])

const ASPECT_RATIOS = [
  { value: '1:1', label: 'config:multimodal.imageConfig.square' },
  { value: '4:3', label: 'config:multimodal.imageConfig.landscape' },
  { value: '16:9', label: 'config:multimodal.imageConfig.wide' },
  { value: '3:4', label: 'config:multimodal.imageConfig.portrait' },
  { value: '9:16', label: 'config:multimodal.imageConfig.tall' }
]

export function ImageConfig() {
  const { t } = useTranslation('config')
  const capabilities = useCapabilities()
  const options = useCapabilityOptions('image')
  const provider = capabilities.image?.linked_provider ?? ''

  const definitions = useMemo<OptionDefinition[]>(() => {
    const entry = options.imageProviders.find((candidate) => candidate.id === provider)
    const models = entry?.models ?? Array.from(new Set(options.imageProviders.flatMap((candidate) => candidate.models)))
    const list: OptionDefinition[] = [
      {
        name: 'model',
        label: t('multimodal.imageConfig.model'),
        hint: entry ? t('multimodal.imageConfig.emptyModel', { model: entry.models[0] }) : t('multimodal.imageConfig.emptyDefault'),
        placeholder: entry?.models[0] ?? t('multimodal.imageConfig.providerDefault'),
        suggestions: models
      }
    ]
    if (RATIO_PROVIDERS.has(provider)) {
      list.push({
        name: 'aspect_ratio',
        label: t('multimodal.imageConfig.shape'),
        hint: t('multimodal.imageConfig.theProportionsOfTheImages'),
        placeholder: '',
        choices: ASPECT_RATIOS.map((ratio) => ({ ...ratio, label: t(ratio.label) }))
      })
    } else {
      list.push(
        {
          name: 'size',
          label: t('multimodal.imageConfig.size'),
          hint: t('multimodal.imageConfig.inPixelsOrAuto'),
          placeholder: t('multimodal.imageConfig.providerDefault'),
          suggestions: ['auto', '1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792']
        },
        {
          name: 'quality',
          label: t('multimodal.imageConfig.quality'),
          hint: t('multimodal.imageConfig.higherCostsMoreAndTakes'),
          placeholder: t('multimodal.imageConfig.providerDefault'),
          suggestions: ['auto', 'low', 'medium', 'high', 'standard', 'hd']
        }
      )
    }
    return list
  }, [options.imageProviders, provider])

  const linked = Boolean(capabilities.image?.linked_provider_id)
  return (
    <SettingsPage id="image" badge={<StatusBadge tone={linked ? 'ok' : 'muted'}>{linked ? t('multimodal.imageConfig.ready') : t('multimodal.imageConfig.noProvider')}</StatusBadge>}>
      {capabilities.error && <Notice tone="error">{capabilities.error}</Notice>}
      <CapabilitySourceCard capability="image" title={t('multimodal.imageConfig.provider')} configured={linked} status={capabilities.image} onChanged={capabilities.reload} />
      <OptionsCard title={t('multimodal.imageConfig.generation')} options={definitions} saved={options.saved} loading={options.loading} onSave={options.save} />
    </SettingsPage>
  )
}
