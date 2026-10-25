import type { ProviderModel } from '../providers/providerTypes'
import { formatModelSource, formatTokens } from './modelUtils'

type ModelRowProps = {
  model: ProviderModel
  isDefault: boolean
  busy: boolean
  onChoose: (model: ProviderModel) => void
}

// One model of a provider, on one line: click it to make it the model the app starts with.
export function ModelRow({ model, isDefault, busy, onChoose }: ModelRowProps) {
  return (
    <button
      type="button"
      onClick={() => onChoose(model)}
      disabled={busy || isDefault}
      aria-pressed={isDefault}
      className={[
        'group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors disabled:cursor-default',
        isDefault ? 'bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]' : 'hover:bg-[var(--surface-muted)] disabled:opacity-50'
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'flex size-4 shrink-0 items-center justify-center rounded-full border',
          isDefault ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]' : 'border-[var(--border-strong)]'
        ].join(' ')}
      >
        {isDefault && <span className="size-1.5 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{model.display_name || model.model_id}</span>
        {model.display_name && model.display_name !== model.model_id && (
          <span className="block truncate font-mono text-[11px] text-[var(--text-muted)]">{model.model_id}</span>
        )}
      </span>
      <span className="hidden shrink-0 text-[11.5px] text-[var(--text-muted)] sm:block">
        {formatTokens(model.context_window)} ctx · {formatTokens(model.max_output)} out
      </span>
      {model.source === 'user' && (
        <span className="shrink-0 rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--text-muted)]">{formatModelSource(model.source)}</span>
      )}
      {isDefault ? (
        <span className="shrink-0 rounded-md bg-[var(--accent-primary)] px-2 py-0.5 text-[11px] font-semibold text-white">Default</span>
      ) : (
        <span className="shrink-0 text-[11.5px] font-semibold text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Use as default</span>
      )}
    </button>
  )
}
