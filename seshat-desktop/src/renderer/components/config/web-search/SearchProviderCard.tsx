import { useEffect, useState } from 'react'
import { testSearchProvider, updateSearchProvider } from './webSearchApi'
import type { ProviderTestState, SearchProviderConfig } from './webSearchTypes'
import { providerStatus } from './webSearchUtils'
import { WebSearchProviderIcon } from './WebSearchProviderIcon'

type SearchProviderCardProps = {
  provider: SearchProviderConfig
  onSaved: (provider: SearchProviderConfig) => void
}

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
  const needsCredential = provider.requires_api_key && !provider.has_api_key && !apiKeyChanged

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
      const result = await testSearchProvider(provider.provider)
      setTesting(result.ok ? 'ok' : 'error')
      setMessage(result.ok ? `${result.latency_ms} ms` : result.error || 'Provider test failed.')
    } catch (err) {
      setTesting('error')
      setMessage(err instanceof Error ? err.message : 'Provider test failed.')
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <WebSearchProviderIcon provider={provider.provider} label={provider.label} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{provider.label}</div>
              {provider.source && (
                <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                  {provider.source}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">{status.label}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setEnabled(!enabled)
            markDirty()
          }}
          className={[
            'flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
            enabled ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--surface-muted)]'
          ].join(' ')}
          aria-pressed={enabled}
        >
          <span className="size-4 rounded-full bg-white" />
        </button>
      </div>

      <div className="mt-3 grid gap-2">
        {provider.requires_api_key && (
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-muted)]">{provider.provider === 'searxng' ? 'Password' : isReddit ? 'Client secret' : 'API key'}</span>
            <div className="relative">
              <input
                type="password"
                value={provider.provider === 'searxng' ? authPassword : apiKey}
                onChange={(event) => {
                  if (provider.provider === 'searxng') {
                    setAuthPassword(event.target.value)
                    setAuthChanged(true)
                  } else {
                    setApiKey(event.target.value)
                    setApiKeyChanged(true)
                  }
                  markDirty()
                }}
                placeholder={provider.has_api_key ? 'Saved credential' : 'Enter credential'}
                className="h-9 w-full rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none"
              />
              {needsCredential && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[var(--accent-warning)]">Required</span>}
            </div>
          </label>
        )}

        {isReddit && (
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-muted)]">Client ID</span>
            <input value={authUsername} onChange={(event) => { setAuthUsername(event.target.value); setClientIdChanged(true); markDirty() }} placeholder="Client id of your Reddit app" className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
          </label>
        )}

        {provider.provider === 'searxng' && (
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-muted)]">Username</span>
            <input value={authUsername} onChange={(event) => { setAuthUsername(event.target.value); setAuthChanged(true); markDirty() }} placeholder="Optional basic auth user" className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
          </label>
        )}

        {provider.requires_base_url && (
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-muted)]">Base URL</span>
            <input value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); markDirty() }} placeholder={provider.default_base_url || 'https://...'} className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
          </label>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {!isResearch && <button type="button" onClick={() => void handleTest()} disabled={testing === 'running' || saving} className="rounded-md border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-45">
          {testing === 'running' ? 'Testing...' : testing === 'ok' ? 'Connected' : testing === 'error' ? 'Failed' : 'Test'}
        </button>}
        {dirty && (
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-panel)] disabled:opacity-45">
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        {message && (
          <span className={['min-w-0 truncate text-[11px]', testing === 'error' || dirty ? 'text-[var(--accent-danger)]' : 'text-[var(--text-muted)]'].join(' ')}>
            {message}
          </span>
        )}
      </div>
    </div>
  )
}
