import { BrandIcon } from '@renderer/components/plugins/catalog/BrandIcon'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'

// The id of a provider, and the key of its brand mark. A provider with none here keeps the icon drawn for it (OpenAI, Groq, Z.ai...).
const BRAND_OF_PROVIDER: Record<string, string> = {
  anthropic: 'anthropic',
  gemini: 'gemini',
  google: 'gemini',
  mistral: 'mistral',
  ollama: 'ollama',
  deepseek: 'deepseek',
  'deep-seek': 'deepseek',
  openrouter: 'openrouter',
  'open-router': 'openrouter',
  huggingface: 'huggingface'
}

/** The logo of a provider: its real brand mark on a neutral tile when we have it, else the icon drawn for it. */
export function ProviderLogo({ provider, name, size = 48 }: { provider: string; name: string; size?: number }) {
  const brand = BRAND_OF_PROVIDER[provider.toLowerCase()]
  if (brand) return <BrandIcon brand={brand} title={name} size={size} />
  return <ProviderIcon provider={provider} size={size} className="shrink-0" />
}
