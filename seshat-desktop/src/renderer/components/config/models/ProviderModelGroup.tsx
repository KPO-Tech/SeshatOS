import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { ProviderModel, ProviderSetting } from '../providers/providerTypes'
import { ModelRow } from './ModelRow'

type ProviderModelGroupProps = {
  provider: ProviderSetting
  /** The models to list (the search can narrow them) and how many the provider has in all. */
  models: ProviderModel[]
  total: number
  /** The model that is the app default when this provider is the default one. */
  defaultModelId: string | null
  open: boolean
  loading: boolean
  busy: boolean
  onToggle: (provider: ProviderSetting) => void
  onSync: (provider: ProviderSetting) => Promise<void>
  onAddCustom: (provider: ProviderSetting) => void
  onChoose: (provider: ProviderSetting, model: ProviderModel) => void
}

// A provider and its models folded under its name, so one long catalog does not push the next provider out of sight.
export function ProviderModelGroup({ provider, models, total, defaultModelId, open, loading, busy, onToggle, onSync, onAddCustom, onChoose }: ProviderModelGroupProps) {
  const countLabel = models.length === total ? `${total} models` : `${models.length} of ${total}`

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={() => onToggle(provider)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-0.5 text-left hover:bg-[var(--surface-muted)]"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={['shrink-0 text-[var(--text-muted)] transition-transform duration-150', open ? 'rotate-90' : ''].join(' ')}>
            <path d="m6 3.5 4.5 4.5L6 12.5" />
          </svg>
          <ProviderIcon provider={provider.provider} size={30} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{provider.name || provider.provider}</span>
              {defaultModelId && <span className="shrink-0 rounded-md bg-[var(--accent-primary)]/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent-primary)]">Default provider</span>}
            </span>
            <span className="block truncate text-[12px] text-[var(--text-muted)]">{loading ? 'Loading models...' : countLabel}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => onAddCustom(provider)} className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
            Custom
          </button>
          <button type="button" onClick={() => void onSync(provider)} disabled={busy} className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-45">
            {busy ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {open && (
        <div className="max-h-[300px] overflow-y-auto border-t border-[var(--border-soft)] p-1.5">
          {models.length === 0 ? (
            <div className="px-3 py-4 text-[12.5px] text-[var(--text-muted)]">{total === 0 ? 'No models yet. Use Sync to load the catalog.' : 'No model matches the search.'}</div>
          ) : (
            models.map((model) => (
              <ModelRow key={model.id} model={model} isDefault={model.model_id === defaultModelId} busy={busy} onChoose={(chosen) => onChoose(provider, chosen)} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
