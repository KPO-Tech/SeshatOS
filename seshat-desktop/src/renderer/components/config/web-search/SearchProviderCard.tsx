import { useEffect, useState } from 'react'
import { ActionButton, SettingRow, SettingsCard, StatusBadge, TextField, Toggle } from '../../settings/kit'
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
    <SettingsCard
      title={provider.label}
      icon={<WebSearchProviderIcon provider={provider.provider} label={provider.label} size={24} />}
      badge={<StatusBadge tone={status.tone === 'success' ? 'ok' : status.tone}>{status.label}</StatusBadge>}
      action={
        <Toggle
          label={`Enable ${provider.label}`}
          enabled={enabled}
          onChange={(next) => {
            setEnabled(next)
            markDirty()
          }}
        />
      }
    >
      {provider.requires_api_key && (
        <SettingRow title={credentialLabel}>
          <TextField
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
        </SettingRow>
      )}
      {isReddit && (
        <SettingRow title="Client ID">
          <TextField
            label="Client ID"
            value={authUsername}
            onChange={(value) => {
              setAuthUsername(value)
              setClientIdChanged(true)
              markDirty()
            }}
            placeholder="Reddit app client id"
          />
        </SettingRow>
      )}
      {isSearxng && (
        <SettingRow title="Username">
          <TextField
            label="Username"
            value={authUsername}
            onChange={(value) => {
              setAuthUsername(value)
              setAuthChanged(true)
              markDirty()
            }}
            placeholder="Optional"
          />
        </SettingRow>
      )}
      {provider.requires_base_url && (
        <SettingRow title="Base URL">
          <TextField
            label="Base URL"
            value={baseUrl}
            onChange={(value) => {
              setBaseUrl(value)
              markDirty()
            }}
            placeholder={provider.default_base_url || 'https://...'}
            mono
          />
        </SettingRow>
      )}
      {hasActions && (
        <SettingRow title={message || ' '}>
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
        </SettingRow>
      )}
    </SettingsCard>
  )
}
