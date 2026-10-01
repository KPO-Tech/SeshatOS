import { useEffect, useMemo, useState } from 'react'
import { ConfigCard, CustomSelect, Field, SoftButton, StatusPill, type SelectOption } from '../knowledge/KnowledgePrimitives'
import { linkCapability } from './multimodalApi'
import { CapabilityIcon, SourceIcon } from './MultimodalIcons'
import type { CapabilityName, CapabilityStatus } from './multimodalTypes'

type Props = {
  capability: Extract<CapabilityName, 'image' | 'audio'>
  title: string
  description: string
  configured?: boolean
  status: CapabilityStatus | null
  onChanged: () => Promise<void>
}

const NO_PROVIDER = '__none__'

export function CapabilitySourceCard({ capability, title, description, configured, status, onChanged }: Props) {
  const [source, setSource] = useState(NO_PROVIDER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSource(status?.linked_provider_id || NO_PROVIDER)
  }, [status?.linked_provider_id])

  const options: SelectOption[] = useMemo(() => {
    const providerOptions = (status?.candidates ?? []).map((candidate) => ({
      value: candidate.id,
      label: candidate.name,
      description: providerDescription(candidate.provider, capability),
      icon: <SourceIcon provider={candidate.provider} />
    }))
    return [
      {
        value: NO_PROVIDER,
        label: 'Select provider',
        description: capability === 'image' ? 'OpenAI or Gemini provider' : 'OpenAI provider',
        icon: <SourceIcon provider="custom" />
      },
      ...providerOptions
    ]
  }, [capability, status?.candidates])

  async function handleSourceChange(value: string) {
    if (value === NO_PROVIDER) return
    setSource(value)
    setSaving(true)
    setError(null)
    try {
      await linkCapability(capability, value)
      await onChanged()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to update capability source.')
    } finally {
      setSaving(false)
    }
  }

  const linked = source !== NO_PROVIDER
  const hasProviders = (status?.candidates.length ?? 0) > 0
  const badgeTone = configured || linked ? 'ok' : hasProviders ? 'warn' : 'muted'

  return (
    <ConfigCard
      title={title}
      description={description}
      status={<StatusPill tone={badgeTone}>{configured || linked ? 'Provider linked' : hasProviders ? 'Choose provider' : 'No provider'}</StatusPill>}
      action={<CapabilityIcon name={capability} />}
    >
      <div className="grid gap-4">
        {hasProviders ? (
          <Field label="Provider">
            <CustomSelect value={source} options={options} onChange={(value) => void handleSourceChange(value)} />
          </Field>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-3">
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">No compatible provider configured</div>
            <div className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
              Add {capability === 'image' ? 'OpenAI or Gemini' : 'OpenAI'} in Providers, then select it here for this capability.
            </div>
          </div>
        )}

        <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">
            {linked ? status?.linked_name || 'Linked provider' : 'Provider not selected'}
          </div>
          <div className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
            {linked
              ? 'SeshatOS reuses the API key already saved in Providers.'
              : 'This capability should be attached to a provider before agents rely on it.'}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end">
          <SoftButton type="button" tone={linked ? 'success' : 'default'} disabled>
            {saving ? 'Saving...' : linked ? 'Provider synced' : 'Waiting for provider'}
          </SoftButton>
        </div>
      </div>
    </ConfigCard>
  )
}

function providerDescription(provider: string, capability: CapabilityName) {
  if (capability === 'audio') return 'Audio-capable provider'
  if (provider === 'openai') return 'Images API'
  if (provider === 'gemini') return 'Gemini image generation'
  return 'Configured provider'
}
