import { useMemo } from 'react'
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
        hint: entry ? `Empty uses ${entry.models[0]}, the default model of ${entry.display_name}.` : 'Empty uses the default model of the provider. The name must be one the provider offers.',
        placeholder: entry?.models[0] ?? 'Provider default',
        suggestions: models
      }
    ]
    if (RATIO_PROVIDERS.has(provider)) {
      list.push({
        name: 'aspect_ratio',
        label: 'Shape',
        hint: 'The proportions of the images. The agent keeps this unless the provider default suits better.',
        placeholder: '',
        choices: ASPECT_RATIOS
      })
    } else {
      list.push(
        {
          name: 'size',
          label: 'Size',
          hint: 'Width and height in pixels, or auto to let the model choose. Which sizes work depends on the model.',
          placeholder: 'Provider default',
          suggestions: ['auto', '1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792']
        },
        {
          name: 'quality',
          label: 'Quality',
          hint: 'Higher quality costs more and takes longer. GPT Image models take low, medium, high or auto; DALL-E 3 takes standard or hd.',
          placeholder: 'Provider default',
          suggestions: ['auto', 'low', 'medium', 'high', 'standard', 'hd']
        }
      )
    }
    return list
  }, [options.imageProviders, provider])

  return (
    <div className="grid gap-4">
      {capabilities.error && (
        <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
          {capabilities.error}
        </div>
      )}

      <CapabilitySourceCard
        capability="image"
        title="Provider"
        description="The provider the image tool of the agent sends its prompts to. It reuses the key saved in Providers."
        configured={Boolean(capabilities.image?.linked_provider_id)}
        status={capabilities.image}
        onChanged={capabilities.reload}
      />

      <OptionsCard
        title="Generation"
        description="What the agent asks the provider for each time it creates an image."
        options={definitions}
        saved={options.saved}
        loading={options.loading}
        onSave={options.save}
      />
    </div>
  )
}
