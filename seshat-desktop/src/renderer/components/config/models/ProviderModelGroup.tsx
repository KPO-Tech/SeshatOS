import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { ProviderModel, ProviderSetting } from '../providers/providerTypes'
import { getSelectedModel } from './modelUtils'

type ProviderModelGroupProps = {
  provider: ProviderSetting
  models: ProviderModel[]
  loading: boolean
  busy: boolean
  onSync: (provider: ProviderSetting) => Promise<void>
  onAddCustom: (provider: ProviderSetting) => void
}

export function ProviderModelGroup({ provider, models, loading, busy, onSync, onAddCustom }: ProviderModelGroupProps) {
  const selected = getSelectedModel(provider, models)

  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ProviderIcon provider={provider.provider} size={34} className="shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{provider.name || provider.provider}</div>
            <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
              {selected ? selected.display_name || selected.model_id : loading ? 'Loading models...' : 'No model selected'}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
            {models.length} models
          </span>
          <button type="button" onClick={() => onAddCustom(provider)} className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
            Custom
          </button>
          <button type="button" onClick={() => void onSync(provider)} disabled={busy} className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-45">
            {busy ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>
    </div>
  )
}
