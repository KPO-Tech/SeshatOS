import type { ProviderSetting } from '@renderer/api/types'
import { ActionButton, SettingRow, TextField } from '../../settings/kit'
import { useTranslation } from 'react-i18next'

type Props = {
  // The provider of Config > Providers whose key this service can use, when the person has set it up.
  ownProvider: ProviderSetting | null
  // The name of the service when it has a provider in Config > Providers that is not set up yet, to say where to add it.
  missingProviderName?: string
  useOwnKey: boolean
  onUseOwnKey: (use: boolean) => void
  apiKey: string
  onApiKey: (key: string) => void
  hasStoredKey: boolean
  emptyPlaceholder: string
}

// The key of an embedding or rerank service. A provider already set up in Config > Providers is used as it is, with nothing to type;
// the person can still give another key. Without that provider the key is typed here, and the screen says where to add the provider.
export function ProviderKeyField({ ownProvider, missingProviderName, useOwnKey, onUseOwnKey, apiKey, onApiKey, hasStoredKey, emptyPlaceholder }: Props) {
  const { t } = useTranslation('config')
  if (ownProvider && useOwnKey) {
    return (
      <SettingRow title={t('search.providerKeyField.apiKey')} hint={t('search.providerKeyField.usesKeyOf', { name: ownProvider.name })}>
        <ActionButton type="button" onClick={() => onUseOwnKey(false)}>
          {t('search.providerKeyField.useAnother')}
        </ActionButton>
      </SettingRow>
    )
  }
  return (
    <SettingRow title={t('search.providerKeyField.apiKey')} hint={!ownProvider && missingProviderName ? t('search.providerKeyField.addToReuse', { name: missingProviderName }) : undefined}>
      <TextField label={t('search.providerKeyField.apiKey')} type="password" value={apiKey} onChange={onApiKey} placeholder={hasStoredKey ? t('search.providerKeyField.keepCurrentKey') : emptyPlaceholder} width={220} />
      {ownProvider && (
        <ActionButton type="button" onClick={() => onUseOwnKey(true)}>
          {t('search.providerKeyField.use', { name: ownProvider.name })}
        </ActionButton>
      )}
    </SettingRow>
  )
}
