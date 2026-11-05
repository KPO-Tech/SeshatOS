import { useEffect, useMemo, useState } from 'react'
import { Cube } from '@icon-park/react'
import { SelectField, SettingRow, SettingsCard, StatusBadge, type SelectOption } from '../../../settings/kit'
import { linkCapability } from '../multimodalApi'
import { SourceIcon } from '../MultimodalIcons'
import type { CapabilityStatus } from '../multimodalTypes'
import { useTranslation } from 'react-i18next'

const NO_PROVIDER = '__none__'

/** The provider that transcribes and speaks in the cloud: it reuses the key saved in Providers. */
export function ProviderTab({ status, onChanged, onError }: { status: CapabilityStatus | null; onChanged: () => Promise<void>; onError: (message: string | null) => void }) {
  const { t } = useTranslation('config')
  const [source, setSource] = useState(NO_PROVIDER)

  useEffect(() => {
    setSource(status?.linked_provider_id || NO_PROVIDER)
  }, [status?.linked_provider_id])

  const options: SelectOption[] = useMemo(
    () => [
      { value: NO_PROVIDER, label: t('multimodal.audio.providerTab.none'), icon: <SourceIcon provider="custom" /> },
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
    <SettingsCard title={t('multimodal.audio.providerTab.audioProvider')} icon={<Cube theme="outline" size={16} />} badge={<StatusBadge tone={linked ? 'ok' : 'muted'}>{linked ? t('multimodal.audio.providerTab.linked') : t('multimodal.audio.providerTab.notLinked')}</StatusBadge>}>
      {hasProviders ? (
        <SettingRow title={t('multimodal.audio.providerTab.provider')}>
          <div className="w-[260px]">
            <SelectField compact value={source} options={options} onChange={(value) => void change(value)} />
          </div>
        </SettingRow>
      ) : (
        <SettingRow title={t('multimodal.audio.providerTab.noProviderYet')} hint={t('multimodal.audio.providerTab.addAnOpenaiProviderIn')} />
      )}
    </SettingsCard>
  )
}
