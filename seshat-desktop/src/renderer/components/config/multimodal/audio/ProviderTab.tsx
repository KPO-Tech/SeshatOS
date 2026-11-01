import { useEffect, useMemo, useState } from 'react'
import { Cube } from '@icon-park/react'
import { SelectField, SettingRow, SettingsCard, StatusBadge, type SelectOption } from '../../../settings/kit'
import { linkCapability } from '../multimodalApi'
import { SourceIcon } from '../MultimodalIcons'
import type { CapabilityStatus } from '../multimodalTypes'

const NO_PROVIDER = '__none__'

/** The provider that transcribes and speaks in the cloud: it reuses the key saved in Providers. */
export function ProviderTab({ status, onChanged, onError }: { status: CapabilityStatus | null; onChanged: () => Promise<void>; onError: (message: string | null) => void }) {
  const [source, setSource] = useState(NO_PROVIDER)

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

  async function change(value: string) {
    if (value === NO_PROVIDER) return
    setSource(value)
    onError(null)
    try {
      await linkCapability('audio', value)
      await onChanged()
    } catch (err) {
      onError((err as { message?: string })?.message ?? 'Failed to update the audio provider.')
    }
  }

  const linked = source !== NO_PROVIDER
  const hasProviders = (status?.candidates.length ?? 0) > 0

  return (
    <SettingsCard title="Audio provider" icon={<Cube theme="outline" size={16} />} badge={<StatusBadge tone={linked ? 'ok' : 'muted'}>{linked ? 'Linked' : 'Not linked'}</StatusBadge>}>
      {hasProviders ? (
        <SettingRow title="Provider">
          <div className="w-[260px]">
            <SelectField compact value={source} options={options} onChange={(value) => void change(value)} />
          </div>
        </SettingRow>
      ) : (
        <SettingRow title="No provider yet" hint="Add an OpenAI provider in Providers, then pick it here." />
      )}
    </SettingsCard>
  )
}
