import { useEffect, useMemo, useState } from 'react'
import { Notice, SelectField, SettingRow, SettingsCard, StatusBadge, type SelectOption } from '../../settings/kit'
import { linkCapability } from './multimodalApi'
import { SourceIcon } from './MultimodalIcons'
import type { CapabilityName, CapabilityStatus } from './multimodalTypes'

type Props = {
  capability: Extract<CapabilityName, 'image' | 'audio'>
  title: string
  configured?: boolean
  status: CapabilityStatus | null
  onChanged: () => Promise<void>
}

const NO_PROVIDER = '__none__'

/** Which provider a capability goes through. It reuses the key saved in Providers. */
export function CapabilitySourceCard({ capability, title, configured, status, onChanged }: Props) {
  const [source, setSource] = useState(NO_PROVIDER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSource(status?.linked_provider_id || NO_PROVIDER)
  }, [status?.linked_provider_id])

  const options: SelectOption[] = useMemo(
    () => [
      { value: NO_PROVIDER, label: 'None', icon: <SourceIcon provider="custom" /> },
      ...(status?.candidates ?? []).map((candidate) => ({ value: candidate.id, label: candidate.name, icon: <SourceIcon provider={candidate.provider} /> }))
    ],
    [status?.candidates]
  )

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

  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      <SettingsCard title={title} badge={<StatusBadge tone={configured || linked ? 'ok' : 'muted'}>{configured || linked ? 'Linked' : 'Not linked'}</StatusBadge>}>
        {hasProviders ? (
          <SettingRow title="Provider" hint={saving ? 'Saving...' : undefined}>
            <div className="w-[240px]">
              <SelectField value={source} options={options} onChange={(value) => void handleSourceChange(value)} />
            </div>
          </SettingRow>
        ) : (
          <SettingRow title="No provider yet" hint={`Add ${capability === 'image' ? 'OpenAI, Gemini or OpenRouter' : 'OpenAI'} in Providers.`} />
        )}
      </SettingsCard>
    </>
  )
}
