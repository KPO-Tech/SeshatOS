import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { ProviderModel, ProviderSetting } from '../providers/providerTypes'
import { formatModelSource, formatTokens } from './modelUtils'

type ModelCardProps = {
  provider: ProviderSetting
  model: ProviderModel
  selected: boolean
  busy: boolean
  onSelect: (provider: ProviderSetting, model: ProviderModel) => Promise<void>
}

export function ModelCard({ provider, model, selected, busy, onSelect }: ModelCardProps) {
  return (
    <button
      type="button"
      onClick={() => void onSelect(provider, model)}
      disabled={busy}
      className={[
        'grid gap-2 rounded-lg border bg-[var(--surface-panel)] p-3 text-left transition-colors disabled:opacity-50',
        selected ? 'border-[var(--accent-primary)]' : 'border-[var(--border-soft)] hover:border-[var(--border-strong)]'
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProviderIcon provider={provider.provider} size={28} className="shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{model.display_name || model.model_id}</div>
            <div className="truncate text-[11px] text-[var(--text-muted)]">{provider.name || provider.provider}</div>
          </div>
        </div>
        {selected && (
          <span className="shrink-0 rounded-md bg-[var(--accent-primary)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-primary)]">
            Selected
          </span>
        )}
      </div>
      <div className="truncate font-mono text-[11px] text-[var(--text-muted)]">{model.model_id}</div>
      <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
        <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1">{formatTokens(model.context_window)} ctx</span>
        <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1">{formatTokens(model.max_output)} max</span>
        <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1">{formatModelSource(model.source)}</span>
      </div>
    </button>
  )
}
