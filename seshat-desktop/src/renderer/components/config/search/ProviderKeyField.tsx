import type { ProviderSetting } from '@renderer/api/types'
import { Field, TextInput } from '../knowledge/KnowledgePrimitives'

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
      <Field label="API key">
        <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[12.5px] text-[var(--text-secondary)]">
          <span className="min-w-0 truncate">
            <span className="text-[var(--accent-success)]">&#10003;</span> Key of {ownProvider.name}
          </span>
          <button type="button" onClick={() => onUseOwnKey(false)} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[11.5px] text-[var(--accent-primary)] hover:underline">
            Use another
          </button>
        </div>
      </Field>
    )
  }
  return (
    <Field label="API key">
      <TextInput type="password" value={apiKey} onChange={(event) => onApiKey(event.target.value)} placeholder={hasStoredKey ? 'Keep current key' : emptyPlaceholder} autoComplete="new-password" />
      {ownProvider && (
        <button type="button" onClick={() => onUseOwnKey(true)} className="w-fit cursor-pointer border-0 bg-transparent p-0 text-[11.5px] text-[var(--accent-primary)] hover:underline">
          Use the key of {ownProvider.name}
        </button>
      )}
      {!ownProvider && missingProviderName && <span className="text-[11.5px] text-[var(--text-muted)]">Add {missingProviderName} in Providers to use its key here.</span>}
    </Field>
  )
}
