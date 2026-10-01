import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { ProviderModel, ProviderRowModel, ProviderSetting } from './providerTypes'
import { ProviderOAuthControls } from './ProviderOAuthControls'
import { formatModelMeta, getProviderConnection, isCodexProvider } from './providerUtils'

type ProviderRowProps = {
  row: ProviderRowModel
  expanded: boolean
  busy: boolean
  models: ProviderModel[]
  onToggleModels: (setting: ProviderSetting) => Promise<void>
  onSyncModels: (setting: ProviderSetting) => Promise<void>
  onSetDefault: (setting: ProviderSetting) => Promise<void>
  onRemove: (setting: ProviderSetting) => Promise<void>
  onProviderChanged: (setting?: ProviderSetting) => void
  onError: (message: string) => void
}

export function ProviderRow({
  row,
  expanded,
  busy,
  models,
  onToggleModels,
  onSyncModels,
  onSetDefault,
  onRemove,
  onProviderChanged,
  onError
}: ProviderRowProps) {
  const setting = row.setting
  const connected = setting ? getProviderConnection(setting) : { label: 'Not configured', tone: 'muted' as const }
  const isCodex = isCodexProvider(row.provider)

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProviderIcon provider={row.provider} size={36} className="shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{row.name}</div>
              {setting?.is_default && (
                <span className="rounded-md bg-[var(--accent-primary)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-primary)]">
                  Default
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
              {row.description || setting?.base_url || row.provider}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={['rounded-md px-2 py-1 text-[11px] font-semibold', connected.tone === 'success' ? 'bg-[var(--accent-success)]/15 text-[var(--accent-success)]' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'].join(' ')}>
            {connected.label}
          </span>
          {setting ? (
            <>
              <button type="button" onClick={() => void onToggleModels(setting)} className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
                {expanded ? 'Hide' : 'Models'}
              </button>
              <button type="button" onClick={() => void onSetDefault(setting)} disabled={busy || setting.is_default} className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-45">
                Default
              </button>
              <button type="button" onClick={() => void onRemove(setting)} disabled={busy} className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--accent-danger)] hover:bg-[var(--surface-muted)] disabled:opacity-45">
                Delete
              </button>
            </>
          ) : (
            <span className="text-[12px] font-semibold text-[var(--text-muted)]">{row.authTypeLabel}</span>
          )}
        </div>
      </div>

      {expanded && setting && (
        <div className="border-t border-[var(--border-soft)] px-4 py-3">
          {isCodex && setting.auth_kind === 'oauth' && (
            <ProviderOAuthControls
              setting={setting}
              busy={busy}
              onChanged={onProviderChanged}
              onError={onError}
            />
          )}
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">Models</div>
            <button type="button" onClick={() => void onSyncModels(setting)} disabled={busy} className="rounded-md border border-[var(--border-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-45">
              {busy ? 'Syncing...' : 'Sync'}
            </button>
          </div>
          {models.length === 0 ? (
            <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-3 text-[12px] text-[var(--text-muted)]">
              No models loaded yet.
            </div>
          ) : (
            <div className="grid gap-1.5">
              {models.slice(0, 8).map((model) => (
                <div key={model.id || model.model_id} className="flex items-center justify-between gap-4 rounded-md bg-[var(--surface-muted)] px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{model.display_name || model.model_id}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{formatModelMeta(model)}</div>
                  </div>
                  {model.is_default && <span className="text-[11px] font-semibold text-[var(--accent-primary)]">Default</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
