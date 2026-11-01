import { useMemo } from 'react'
import { Notice, SettingsPage, StatusBadge } from '../../settings/kit'
import { CapabilitySourceCard } from './CapabilitySourceCard'
import { useCapabilityOptions } from './capabilityOptions'
import { OptionsCard, type OptionDefinition } from './OptionsCard'
import { useCapabilities } from './useCapabilities'

// Gemini and OpenRouter shape an image with an aspect ratio; the OpenAI image API and the servers that copy it take a size and a quality.
const RATIO_PROVIDERS = new Set(['gemini', 'openrouter'])

const ASPECT_RATIOS = [
  { value: '1:1', label: 'Square (1:1)' },
  { value: '4:3', label: 'Landscape (4:3)' },
  { value: '16:9', label: 'Wide (16:9)' },
  { value: '3:4', label: 'Portrait (3:4)' },
  { value: '9:16', label: 'Tall (9:16)' }
]

export function ImageConfig() {
  const capabilities = useCapabilities()
  const options = useCapabilityOptions('image')
  const provider = capabilities.image?.linked_provider ?? ''

  const definitions = useMemo<OptionDefinition[]>(() => {
    const entry = options.imageProviders.find((candidate) => candidate.id === provider)
    const models = entry?.models ?? Array.from(new Set(options.imageProviders.flatMap((candidate) => candidate.models)))
    const list: OptionDefinition[] = [
      {
        name: 'model',
        label: 'Model',
        hint: entry ? `Empty: ${entry.models[0]}` : 'Empty: the provider default.',
        placeholder: entry?.models[0] ?? 'Provider default',
        suggestions: models
      }
    ]
    if (RATIO_PROVIDERS.has(provider)) {
      list.push({
        name: 'aspect_ratio',
        label: 'Shape',
        hint: 'The proportions of the images.',
        placeholder: '',
        choices: ASPECT_RATIOS
      })
    } else {
      list.push(
        {
          name: 'size',
          label: 'Size',
          hint: 'In pixels, or auto.',
          placeholder: 'Provider default',
          suggestions: ['auto', '1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792']
        },
        {
          name: 'quality',
          label: 'Quality',
          hint: 'Higher costs more and takes longer.',
          placeholder: 'Provider default',
          suggestions: ['auto', 'low', 'medium', 'high', 'standard', 'hd']
        }
      )
    }
    return list
  }, [options.imageProviders, provider])

  const linked = Boolean(capabilities.image?.linked_provider_id)
  return (
    <SettingsPage id="image" badge={<StatusBadge tone={linked ? 'ok' : 'muted'}>{linked ? 'Ready' : 'No provider'}</StatusBadge>}>
      {capabilities.error && <Notice tone="error">{capabilities.error}</Notice>}
      <CapabilitySourceCard capability="image" title="Provider" configured={linked} status={capabilities.image} onChanged={capabilities.reload} />
      <OptionsCard title="Generation" options={definitions} saved={options.saved} loading={options.loading} onSave={options.save} />
    </SettingsPage>
  )
}
