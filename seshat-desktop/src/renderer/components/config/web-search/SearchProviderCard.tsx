import { useEffect, useState } from 'react'
import { ActionButton, StatusBadge, Toggle } from '../../settings/kit'
import { testSearchProvider, updateSearchProvider } from './webSearchApi'
import type { ProviderTestState, SearchProviderConfig } from './webSearchTypes'
import { providerStatus } from './webSearchUtils'
import { WebSearchProviderIcon } from './WebSearchProviderIcon'

type SearchProviderCardProps = {
  provider: SearchProviderConfig
  onSaved: (provider: SearchProviderConfig) => void
}

/** One search provider: its switch, its credentials and a test, in a card of its own. */
export function SearchProviderCard({ provider, onSaved }: SearchProviderCardProps) {
  const [enabled, setEnabled] = useState(provider.enabled)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(provider.base_url || provider.default_base_url || '')
  const [authUsername, setAuthUsername] = useState(provider.auth_username || '')
  const [authPassword, setAuthPassword] = useState('')
  const [apiKeyChanged, setApiKeyChanged] = useState(false)
  const [authChanged, setAuthChanged] = useState(false)
  const [clientIdChanged, setClientIdChanged] = useState(false)
  const isResearch = provider.kind === 'research'
  const isReddit = provider.provider === 'reddit'
  const isSearxng = provider.provider === 'searxng'
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<ProviderTestState>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setEnabled(provider.enabled)
    setBaseUrl(provider.base_url || provider.default_base_url || '')
    setAuthUsername(provider.auth_username || '')
  }, [provider])

  const status = providerStatus({ ...provider, enabled })

  function markDirty() {
    setDirty(true)
    setTesting('idle')
    setMessage('')
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setMessage('')
    try {
      const updated = await updateSearchProvider(provider.provider, {
        enabled,
        api_key: authChanged ? authPassword : apiKeyChanged ? apiKey : undefined,
        base_url: provider.requires_base_url || baseUrl ? baseUrl : undefined,
        auth_username: authChanged || clientIdChanged ? authUsername : undefined
      })
      setDirty(false)
      setApiKey('')
      setAuthPassword('')
      setApiKeyChanged(false)
      setAuthChanged(false)
      setClientIdChanged(false)
      onSaved(updated)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save provider.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting('running')
    setMessage('')
    try {
      const result = await testSearchProvider(provider.provider, {
        api_key: authChanged ? authPassword : apiKeyChanged ? apiKey : undefined,
        base_url: baseUrl || undefined,
        auth_username: authChanged || clientIdChanged ? authUsername : undefined
      })
      setTesting(result.ok ? 'ok' : 'error')
      setMessage(result.ok ? `Connected in ${result.latency_ms} ms` : result.error || 'Provider test failed.')
    } catch (err) {
      setTesting('error')
      setMessage(err instanceof Error ? err.message : 'Provider test failed.')
    }
  }

  const credentialLabel = isSearxng ? 'Password' : isReddit ? 'Client secret' : 'API key'
  const hasActions = !isResearch || dirty

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <WebSearchProviderIcon provider={provider.provider} label={provider.label} size={32} />
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[14px] font-semibold text-[var(--text-primary)]">{provider.label}</h2>
            <div className="mt-1">
              <StatusBadge tone={status.tone === 'success' ? 'ok' : status.tone}>{status.label}</StatusBadge>
            </div>
          </div>
        </div>
        <Toggle
          label={`Enable ${provider.label}`}
          enabled={enabled}
          onChange={(next) => {
            setEnabled(next)
            markDirty()
          }}
        />
      </div>

      <div className="mt-4 grid gap-3">
        {provider.requires_api_key && (
          <Field label={credentialLabel}>
            <Input
              label={credentialLabel}
              type="password"
              value={isSearxng ? authPassword : apiKey}
              onChange={(value) => {
                if (isSearxng) {
                  setAuthPassword(value)
                  setAuthChanged(true)
                } else {
                  setApiKey(value)
                  setApiKeyChanged(true)
                }
                markDirty()
              }}
              placeholder={provider.has_api_key ? 'Saved' : 'Required'}
            />
          </Field>
        )}
        {isReddit && (
          <Field label="Client ID">
            <Input
              label="Client ID"
              value={authUsername}
              onChange={(value) => {
                setAuthUsername(value)
                setClientIdChanged(true)
                markDirty()
              }}
              placeholder="Reddit app client id"
            />
          </Field>
        )}
        {isSearxng && (
          <Field label="Username">
            <Input
              label="Username"
              value={authUsername}
              onChange={(value) => {
                setAuthUsername(value)
                setAuthChanged(true)
                markDirty()
              }}
              placeholder="Optional"
            />
          </Field>
        )}
        {provider.requires_base_url && (
          <Field label="Base URL">
            <Input
              label="Base URL"
              value={baseUrl}
              onChange={(value) => {
                setBaseUrl(value)
                markDirty()
              }}
              placeholder={provider.default_base_url || 'https://...'}
              mono
            />
          </Field>
        )}
      </div>

      {(hasActions || message) && (
        <div className="mt-4 flex min-h-9 items-center justify-between gap-3">
          <span className={`min-w-0 truncate text-[12px] ${testing === 'error' || (dirty && message) ? 'text-[var(--accent-danger)]' : 'text-[var(--text-muted)]'}`}>{message}</span>
          <div className="flex shrink-0 items-center gap-2">
            {!isResearch && (
              <ActionButton type="button" onClick={() => void handleTest()} disabled={testing === 'running' || saving}>
                {testing === 'running' ? 'Testing...' : 'Test'}
              </ActionButton>
            )}
            {dirty && (
              <ActionButton type="button" tone="primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </ActionButton>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  )
}

function Input({ label, value, onChange, placeholder, type = 'text', mono = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: 'text' | 'password'; mono?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`h-9 w-full min-w-0 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)] ${mono ? 'font-mono' : ''}`}
    />
  )
}
