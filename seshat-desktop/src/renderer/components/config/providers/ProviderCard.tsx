import { useState } from 'react'
import { Down, More, SettingTwo } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { ProviderLogo } from './ProviderLogo'
import { ProviderOAuthControls } from './ProviderOAuthControls'
import type { ProviderModel, ProviderRowModel, ProviderSetting } from './providerTypes'
import { formatModelMeta, getProviderConnection, isCodexProvider, plainText } from './providerUtils'

export type TestResult = { state: 'testing' } | { state: 'ok'; models: number } | { state: 'failed'; message: string }

type Props = {
  row: ProviderRowModel
  models: ProviderModel[]
  busy: boolean
  test?: TestResult
  onSetUp: () => void
  onTest: (setting: ProviderSetting) => void
  onSetDefault: (setting: ProviderSetting) => void
  onRemove: (setting: ProviderSetting) => void
  onChangeDefaultModel: (setting: ProviderSetting, modelId: string) => void
  onChangeSecret: (setting: ProviderSetting, change: { api_key?: string; base_url?: string }) => Promise<void>
  onProviderChanged: (setting?: ProviderSetting) => void
  onError: (message: string) => void
}

const GHOST = 'h-8 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-3 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50'

function Pill({ tone, children }: { tone: 'ok' | 'muted' | 'danger' | 'accent'; children: string }) {
  const style = {
    ok: 'bg-[color-mix(in_srgb,var(--accent-success)_16%,transparent)] text-[var(--accent-success)]',
    danger: 'bg-[color-mix(in_srgb,var(--accent-danger)_16%,transparent)] text-[var(--accent-danger)]',
    accent: 'bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]',
    muted: 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'
  }[tone]
  return <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${style}`}>{children}</span>
}

function ModelChips({ models }: { models: ProviderModel[] }) {
  if (models.length === 0) return null
  const shown = models.slice(0, 2)
  return (
    <div className="mt-2.5 flex flex-nowrap gap-1.5 overflow-hidden" title={models.map((model) => model.display_name || model.model_id).join(', ')}>
      {shown.map((model) => (
        <span key={model.id || model.model_id} className="max-w-[104px] shrink-0 truncate rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11.5px] text-[var(--text-secondary)]">
          {model.display_name || model.model_id}
        </span>
      ))}
      {models.length > shown.length && <span className="shrink-0 rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11.5px] text-[var(--text-muted)]">+{models.length - shown.length}</span>}
    </div>
  )
}

/** A provider: who it is and what it offers on the left; its key, its state, a test and its default model on the right. */
export function ProviderCard({ row, models, busy, test, onSetUp, onTest, onSetDefault, onRemove, onChangeDefaultModel, onChangeSecret, onProviderChanged, onError }: Props) {
  const setting = row.setting
  const [editing, setEditing] = useState<'api_key' | 'base_url' | null>(null)
  const [draft, setDraft] = useState('')
  const [managing, setManaging] = useState(false)
  const [saving, setSaving] = useState(false)
  const connection = setting ? getProviderConnection(setting) : null
  const codex = isCodexProvider(row.provider)
  const local = row.provider === 'ollama'
  const defaultModel = models.find((model) => model.model_id === setting?.model_id) ?? models.find((model) => model.is_default)

  async function save() {
    if (!setting || !editing || !draft.trim()) return
    setSaving(true)
    try {
      await onChangeSecret(setting, editing === 'api_key' ? { api_key: draft.trim() } : { base_url: draft.trim() })
      setEditing(null)
      setDraft('')
    } finally {
      setSaving(false)
    }
  }

  const menu: DropdownItem[] = setting
    ? [
        { id: 'default', label: 'Set as default provider', onSelect: () => onSetDefault(setting) },
        ...(!codex && !local ? [{ id: 'key', label: 'Change the API key', onSelect: () => { setEditing('api_key'); setDraft('') } }] : []),
        ...(!codex ? [{ id: 'url', label: 'Change the address', onSelect: () => { setEditing('base_url'); setDraft(setting.base_url ?? '') } }] : []),
        { id: 'models', label: 'Manage the models', onSelect: () => setManaging(true) },
        { id: 'remove', label: 'Remove', danger: true, onSelect: () => onRemove(setting) }
      ]
    : []

  return (
    <article className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="flex min-w-[240px] flex-1 items-start gap-3.5">
          <ProviderLogo provider={row.provider} name={row.name} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{row.name}</h3>
              {setting ? <Pill tone={setting.is_default ? 'accent' : 'ok'}>{setting.is_default ? 'Default' : 'Active'}</Pill> : <Pill tone="muted">Not configured</Pill>}
            </div>
            <p className="m-0 mt-1 line-clamp-2 text-[12.5px] leading-[19px] text-[var(--text-secondary)]">{plainText(row.description || setting?.base_url || row.provider)}</p>
            <ModelChips models={models} />
          </div>
        </div>

        {setting ? (
          <div className="flex w-full flex-col gap-2.5 @2xl:w-[330px] @2xl:shrink-0">
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <input
                    autoFocus
                    type={editing === 'api_key' ? 'password' : 'text'}
                    autoComplete="off"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && void save()}
                    placeholder={editing === 'api_key' ? 'New API key' : 'https://...'}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                  />
                  <button type="button" disabled={saving || !draft.trim()} onClick={() => void save()} className="h-8 cursor-pointer rounded-lg border-0 bg-[var(--accent-primary)] px-3 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50">
                    Save
                  </button>
                  <button type="button" disabled={saving} onClick={() => setEditing(null)} className={GHOST}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3">
                    <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{codex ? 'Sign-in' : local ? 'Address' : 'API key'}</span>
                    <span className="truncate font-mono text-[12px] text-[var(--text-secondary)]">
                      {codex ? setting.oauth_account_email || 'ChatGPT account' : local ? setting.base_url || 'http://localhost:11434' : setting.has_api_key ? 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' : 'Not configured'}
                    </span>
                  </div>
                  {connection && <Pill tone={connection.tone === 'success' ? 'ok' : 'muted'}>{connection.label}</Pill>}
                  <button type="button" disabled={busy || test?.state === 'testing'} onClick={() => onTest(setting)} className={GHOST}>
                    {test?.state === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  <Dropdown
                    label="More about this provider"
                    items={menu}
                    trigger={({ toggle }) => (
                      <button type="button" aria-label="More about this provider" onClick={toggle} className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                        <More theme="outline" size={15} />
                      </button>
                    )}
                  />
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="w-[88px] shrink-0 text-[12px] text-[var(--text-muted)]">Default model</span>
              <Dropdown
                label="Default model"
                align="left"
                items={models.slice(0, 40).map((model) => ({ id: model.model_id, label: model.display_name || model.model_id, checked: model.model_id === (defaultModel?.model_id ?? ''), onSelect: () => onChangeDefaultModel(setting, model.model_id) }))}
                trigger={({ toggle }) => (
                  <button type="button" disabled={models.length === 0} onClick={toggle} className="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-60">
                    <span className="truncate">{defaultModel ? defaultModel.display_name || defaultModel.model_id : models.length === 0 ? 'No models yet' : 'Choose a model'}</span>
                    <Down theme="outline" size={12} />
                  </button>
                )}
              />
              <button type="button" aria-label="Manage the models" title="Manage the models" onClick={() => setManaging((value) => !value)} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                <SettingTwo theme="outline" size={15} />
              </button>
            </div>

            {test?.state === 'ok' && <p className="m-0 text-[11.5px] text-[var(--accent-success)]">Reached the provider: {test.models} models.</p>}
            {test?.state === 'failed' && <p className="m-0 text-[11.5px] text-[var(--accent-danger)]">{test.message}</p>}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-3 self-center">
            <span className="text-[12px] text-[var(--text-muted)]">{row.authTypeLabel}</span>
            <button type="button" onClick={onSetUp} className="h-9 cursor-pointer rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90">
              Set up
            </button>
          </div>
        )}
      </div>

      {setting && codex && setting.auth_kind === 'oauth' && (
        <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
          <ProviderOAuthControls setting={setting} busy={busy} onChanged={onProviderChanged} onError={onError} />
        </div>
      )}

      {setting && managing && (
        <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Models ({models.length})</span>
            <button type="button" disabled={busy} onClick={() => onTest(setting)} className={GHOST}>
              {busy ? 'Syncing...' : 'Sync the list'}
            </button>
          </div>
          {models.length === 0 ? (
            <p className="m-0 text-[12px] text-[var(--text-muted)]">No models loaded yet.</p>
          ) : (
            <div className="grid max-h-60 gap-1 overflow-y-auto">
              {models.slice(0, 40).map((model) => (
                <div key={model.id || model.model_id} className="flex items-center justify-between gap-4 rounded-lg bg-[var(--surface-muted)] px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">{model.display_name || model.model_id}</div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">{formatModelMeta(model)}</div>
                  </div>
                  {model.model_id === defaultModel?.model_id && <Pill tone="accent">Default</Pill>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
