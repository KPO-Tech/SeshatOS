import { useEffect, useMemo, useState } from 'react'
import { createProviderSetting } from './providerApi'
import { ProviderSelect } from './ProviderSelect'
import type { ProviderChoice, ProviderForm, ProviderSetting } from './providerTypes'
import { initialProviderForm, isCodexProvider, plainText } from './providerUtils'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

type Props = {
  choices: ProviderChoice[]
  /** The provider to start from, when the person came from a provider that is not set up yet. */
  initialProvider?: string
  onAdded: (setting: ProviderSetting) => void
  onClose: () => void
}

function providerHint(t: TFunction, entry?: ProviderChoice) {
  if (!entry) return t('config:providers.addProviderDialog.pickOne')
  if (entry.main) return plainText(entry.description || t('config:providers.addProviderDialog.builtIn'))
  const untested = t('config:providers.addProviderDialog.genericUntested', { total: entry.model_count })
  return entry.unverified ? t('config:providers.addProviderDialog.unverifiedAddress', { text: untested }) : untested
}

const FIELD = 'h-10 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]'

/** Connects a provider: which one, how to call it, and the key. The key is saved encrypted by the backend. */
export function AddProviderDialog({ choices, initialProvider, onAdded, onClose }: Props) {
  const { t } = useTranslation('config')
  const [form, setForm] = useState<ProviderForm>(() => initialProviderForm(choices.find((entry) => entry.id === initialProvider) ?? choices[0]))
  const [menuOpen, setMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = choices.find((entry) => entry.id === form.provider)
  const codex = isCodexProvider(form.provider)
  const needsBaseUrl = Boolean(selected?.unverified)
  const canSave = useMemo(
    () => Boolean(form.provider) && (form.auth_kind !== 'api_key' || form.api_key.trim().length > 0 || form.provider === 'ollama' || codex) && (!needsBaseUrl || form.base_url.trim().length > 0),
    [form, codex, needsBaseUrl]
  )

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && !saving && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [saving, onClose])

  async function add() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createProviderSetting({
        provider: form.provider,
        name: form.name || selected?.name || form.provider,
        auth_kind: form.provider === 'ollama' ? 'none' : codex ? 'oauth' : form.auth_kind,
        api_key: form.auth_kind === 'api_key' && !codex ? form.api_key : undefined,
        base_url: !codex && form.base_url && (needsBaseUrl || form.base_url !== selected?.base_url) ? form.base_url : undefined
      })
      onAdded(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the provider.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('providers.addProviderDialog.addAProvider')} className="w-full max-w-[560px] rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]">
        <h2 className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">{t('providers.addProviderDialog.addAProvider')}</h2>
        <p className="m-0 mt-1 text-[12.5px] text-[var(--text-muted)]">{t('providers.addProviderDialog.connectALocalOrCloud')}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <ProviderSelect
            choices={choices}
            value={form.provider}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onChange={(provider) => {
              setForm(initialProviderForm(choices.find((entry) => entry.id === provider)))
              setMenuOpen(false)
            }}
          />
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t('providers.addProviderDialog.name')}</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={FIELD} />
          </label>
          {!codex && form.provider !== 'ollama' && (
            <label className="grid gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t('providers.addProviderDialog.apiKey')}</span>
              <input value={form.api_key} onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))} type="password" autoComplete="off" placeholder={t('providers.addProviderDialog.savedEncryptedByTheBackend')} className={FIELD} />
            </label>
          )}
          {!codex && (
            <label className="grid gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">{needsBaseUrl ? t('providers.addProviderDialog.baseUrlCheckItYour') : t('providers.addProviderDialog.baseUrl')}</span>
              <input value={form.base_url} onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))} placeholder={form.provider === 'ollama' ? 'http://localhost:11434' : selected?.base_url || t('providers.addProviderDialog.providerDefault')} className={FIELD} />
            </label>
          )}
        </div>

        <p className="m-0 mt-3 text-[12px] leading-5 text-[var(--text-muted)]">
          {codex ? t('providers.addProviderDialog.codexUsesABrowserSign') : providerHint(t, selected)}
        </p>
        {error && <p className="m-0 mt-2 text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={onClose} className="h-9 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-4 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50">
            {t('providers.addProviderDialog.cancel')}
          </button>
          <button type="button" disabled={!canSave || saving} onClick={() => void add()} className="h-9 cursor-pointer rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50">
            {saving ? t('providers.addProviderDialog.adding') : codex ? t('providers.addProviderDialog.addOauthProvider') : t('providers.addProviderDialog.addProvider')}
          </button>
        </div>
      </div>
    </div>
  )
}
