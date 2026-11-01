import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProviderSetting } from '@renderer/api/types'
import { FreeModelNote, isFreeModel } from './FreeModelNote'
import { ModelCombobox } from './ModelCombobox'
import { ProviderKeyField } from './ProviderKeyField'
import { ReembedPanel } from './ReembedPanel'
import { api } from '@renderer/api/client'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { ActionButton, Notice, SelectField, SettingRow, SettingsCard, StatusBadge, TextField, Toggle, type SelectOption } from '../../settings/kit'
import { detectEmbedderModels, saveEmbedderConfig, testEmbedderConfig } from '@renderer/components/config/knowledge/knowledgeApi'
import type { EmbedderConfig, TestState } from '@renderer/components/config/knowledge/knowledgeTypes'

const BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
  voyage: 'https://api.voyageai.com/v1',
  jina: 'https://api.jina.ai/v1',
  ollama: 'http://localhost:11434',
  tei: 'http://localhost:8082/v1'
}

const MODEL_HINTS: Record<string, string[]> = {
  openai: ['text-embedding-3-small', 'text-embedding-3-large'],
  mistral: ['mistral-embed'],
  gemini: ['gemini-embedding-001', 'gemini-embedding-2'],
  openrouter: ['openai/text-embedding-3-small', 'qwen/qwen3-embedding-8b', 'baai/bge-m3'],
  voyage: ['voyage-4', 'voyage-4-large', 'voyage-4-lite'],
  jina: ['jina-embeddings-v5-text-small', 'jina-embeddings-v5-text-nano', 'jina-embeddings-v4'],
  ollama: [],
  tei: []
}

// The kinds of provider of Config > Providers whose key an embedding provider of this card can take.
const PROVIDER_KINDS: Record<string, string[]> = { openai: ['openai'], mistral: ['mistral'], gemini: ['gemini', 'google'], openrouter: ['openrouter'] }

// What a service is called where the person is told to add its provider.
const MISSING_NAMES: Record<string, string> = { openai: 'OpenAI', mistral: 'Mistral', gemini: 'Google Gemini', openrouter: 'OpenRouter' }

export function EmbedderCard({ config, providers, onSaved }: { config: EmbedderConfig | null; providers: ProviderSetting[]; onSaved: (config: EmbedderConfig) => void }) {
  const [form, setForm] = useState({
    provider: config?.provider || 'tei',
    base_url: config?.base_url || BASE_URLS.tei,
    model: config?.model || '',
    api_key: '',
    enabled: config?.enabled ?? true
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<TestState>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [detectedModels, setDetectedModels] = useState<string[]>([])
  const [detecting, setDetecting] = useState(false)
  // The provider of Config > Providers whose key this one can use, when the person has it set up.
  const ownProvider = useMemo(() => providers.find((item) => item.has_api_key && (PROVIDER_KINDS[form.provider] ?? []).includes(item.provider.toLowerCase())) ?? null, [providers, form.provider])
  const [useOwnKey, setUseOwnKey] = useState(true)

  useEffect(() => {
    if (!config) return
    setForm((current) => ({
      ...current,
      provider: config.provider || 'tei',
      base_url: config.base_url || BASE_URLS[config.provider] || '',
      model: config.model || '',
      enabled: config.enabled
    }))
  }, [config])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setTesting('idle')
  }

  function chooseProvider(provider: string) {
    setDetectedModels([])
    setForm((current) => ({
      ...current,
      provider,
      base_url: BASE_URLS[provider] || current.base_url,
      model: MODEL_HINTS[provider]?.[0] || '',
      api_key: ''
    }))
    setUseOwnKey(true)
    setDirty(true)
    setTesting('idle')
    // The models of a hosted provider (its own list, read live for OpenRouter) are asked for as soon as it is chosen; the hints above show
    // meanwhile.
    if (provider !== 'tei' && provider !== 'ollama') void detectModels(provider, BASE_URLS[provider])
  }

  async function detectModels(provider: string = form.provider, baseUrl: string = form.base_url) {
    setDetecting(true)
    setTestError(null)
    try {
      const result = await detectEmbedderModels({ provider, base_url: baseUrl })
      if (result.error) {
        setTesting('error')
        setTestError(result.error)
        return
      }
      const models = result.embedding_models ?? []
      setDetectedModels(models)
      if (models.length > 0 && !form.model) update('model', models[0])
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Model detection failed.')
    } finally {
      setDetecting(false)
    }
  }

  async function test() {
    setTesting('running')
    setTestError(null)
    setLatency(null)
    try {
      const result = await testEmbedderConfig({
        provider: form.provider,
        base_url: form.base_url,
        model: form.model,
        api_key: form.api_key || undefined,
        provider_setting_id: ownProvider && useOwnKey && !form.api_key ? ownProvider.id : undefined
      })
      setTesting(result.ok ? 'ok' : 'error')
      setLatency(result.latency_ms)
      setTestError(result.error)
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Embedding test failed.')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await saveEmbedderConfig({
        provider: form.provider,
        base_url: form.base_url,
        model: form.model,
        enabled: form.enabled,
        api_key: form.api_key || undefined,
        provider_setting_id: ownProvider && useOwnKey && !form.api_key ? ownProvider.id : undefined
      })
      onSaved(saved)
      setForm((current) => ({ ...current, api_key: '' }))
      setDirty(false)
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Failed to save embedding settings.')
    } finally {
      setSaving(false)
    }
  }

  // The vectors of the documents already indexed belong to the model saved: another model cannot read them.
  // The configuration says whether the vectors are up to date: read it again once they were made again.
  const refreshConfig = useCallback(() => void api.get<EmbedderConfig>('/settings/embedder').then(onSaved).catch(() => undefined), [onSaved])
  const changesModel = Boolean(config?.is_configured && config.model && (form.model !== config.model || form.provider !== config.provider))
  const suggestions = detectedModels.length > 0 ? detectedModels : MODEL_HINTS[form.provider] ?? []
  const providerOptions: SelectOption[] = [
    { value: 'tei', label: 'TEI local', icon: <ProviderIcon provider="tei" size={24} /> },
    { value: 'ollama', label: 'Ollama local', icon: <ProviderIcon provider="ollama" size={24} /> },
    { value: 'openai', label: 'OpenAI', icon: <ProviderIcon provider="openai" size={24} /> },
    { value: 'mistral', label: 'Mistral', icon: <ProviderIcon provider="mistral" size={24} /> },
    { value: 'gemini', label: 'Google Gemini', icon: <ProviderIcon provider="gemini" size={24} /> },
    { value: 'voyage', label: 'Voyage AI', icon: <ProviderIcon provider="voyage" size={24} /> },
    { value: 'jina', label: 'Jina AI', icon: <ProviderIcon provider="jina" size={24} /> },
    { value: 'openrouter', label: 'OpenRouter', icon: <ProviderIcon provider="openrouter" size={24} /> }
  ]

  return (
    <>
      {testing === 'ok' && <Notice tone="ok">{`Connected in ${latency ?? 0} ms`}</Notice>}
      {testing === 'error' && <Notice tone="error">{testError ?? 'Connection failed.'}</Notice>}
      <SettingsCard
        title="Embeddings"
        badge={<StatusBadge tone={config?.is_configured ? 'ok' : 'warn'}>{config?.is_configured ? 'Ready' : 'Review'}</StatusBadge>}
        action={<Toggle label="Use embeddings" enabled={form.enabled} onChange={(enabled) => update('enabled', enabled)} />}
      >
        <SettingRow title="Provider">
          <div className="w-[230px]">
            <SelectField value={form.provider} options={providerOptions} onChange={chooseProvider} />
          </div>
        </SettingRow>
        <SettingRow title="Address">
          <TextField label="Base URL" value={form.base_url} onChange={(value) => update('base_url', value)} placeholder="http://localhost:8082/v1" mono width={300} />
        </SettingRow>
        <SettingRow title="Model">
          <div className="w-[300px]">
            <ModelCombobox value={form.model} options={suggestions} onChange={(model) => update('model', model)} placeholder="text-embedding-3-small" />
          </div>
        </SettingRow>
        <ProviderKeyField
          ownProvider={ownProvider}
          missingProviderName={MISSING_NAMES[form.provider]}
          useOwnKey={useOwnKey}
          onUseOwnKey={(use) => {
            setUseOwnKey(use)
            setDirty(true)
            setTesting('idle')
          }}
          apiKey={form.api_key}
          onApiKey={(key) => update('api_key', key)}
          hasStoredKey={Boolean(config?.has_api_key)}
          emptyPlaceholder="Optional"
        />
        {changesModel && <div className="px-4 py-3 text-[12px] font-semibold text-[var(--accent-primary)]">Indexed documents use {config?.model}. After saving, make their vectors again.</div>}
        {isFreeModel(form.model) && <FreeModelNote what="embedding" />}
        <ReembedPanel config={config} unsaved={dirty} onDone={refreshConfig} />
        <SettingRow title=" ">
          {(form.provider === 'tei' || form.provider === 'ollama') && (
            <ActionButton type="button" onClick={() => void detectModels()} disabled={detecting || !form.base_url}>
              {detecting ? 'Detecting...' : 'Detect models'}
            </ActionButton>
          )}
          <ActionButton type="button" onClick={() => void test()} disabled={!form.base_url || !form.model || testing === 'running'}>
            {testing === 'running' ? 'Testing...' : 'Test'}
          </ActionButton>
          <ActionButton type="button" tone={dirty ? 'primary' : 'default'} onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
          </ActionButton>
        </SettingRow>
      </SettingsCard>
    </>
  )
}
