import type { ProviderSetting } from '@renderer/api/types'
import { ActionButton, SettingRow, TextField } from '../../settings/kit'

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
  if (ownProvider && useOwnKey) {
    return (
      <SettingRow title="API key" hint={`Uses the key of ${ownProvider.name}`}>
        <ActionButton type="button" onClick={() => onUseOwnKey(false)}>
          Use another
        </ActionButton>
      </SettingRow>
    )
  }
  return (
    <SettingRow title="API key" hint={!ownProvider && missingProviderName ? `Add ${missingProviderName} in Providers to reuse its key.` : undefined}>
      <TextField label="API key" type="password" value={apiKey} onChange={onApiKey} placeholder={hasStoredKey ? 'Keep current key' : emptyPlaceholder} width={220} />
      {ownProvider && (
        <ActionButton type="button" onClick={() => onUseOwnKey(true)}>
          {`Use ${ownProvider.name}`}
        </ActionButton>
      )}
    </SettingRow>
  )
}
