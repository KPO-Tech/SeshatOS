import { CapabilitySourceCard } from './CapabilitySourceCard'
import { useCapabilityOptions } from './capabilityOptions'
import { OptionsCard, type OptionDefinition } from './OptionsCard'
import { useCapabilities } from './useCapabilities'

const IMAGE_OPTIONS: readonly OptionDefinition[] = [
  {
    name: 'model',
    label: 'Image model',
    hint: 'Leave empty to use the default model of the provider. The name must be one the provider offers.',
    placeholder: 'Provider default',
    suggestions: ['gpt-image-1', 'dall-e-3', 'dall-e-2']
  }
]

export function ImageConfig() {
  const capabilities = useCapabilities()
  const options = useCapabilityOptions('image')

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
        title="Model"
        description="Which image model the agent asks for."
        options={IMAGE_OPTIONS}
        saved={options.saved}
        loading={options.loading}
        onSave={options.save}
      />
    </div>
  )
}
