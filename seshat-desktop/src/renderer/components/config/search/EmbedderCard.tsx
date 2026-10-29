import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProviderSetting } from '@renderer/api/types'
import { FreeModelNote, isFreeModel } from './FreeModelNote'
import { ModelCombobox } from './ModelCombobox'
import { ProviderKeyField } from './ProviderKeyField'
import { ReembedPanel } from './ReembedPanel'
import { api } from '@renderer/api/client'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { ConfigCard, CustomSelect, Field, ResultMessage, SoftButton, StatusPill, TextInput, ToggleSwitch, type SelectOption } from '@renderer/components/config/knowledge/KnowledgePrimitives'
import { detectEmbedderModels, saveEmbedderConfig, testEmbedderConfig } from '@renderer/components/config/knowledge/knowledgeApi'
import type { EmbedderConfig, TestState } from '@renderer/components/config/knowledge/knowledgeTypes'

const BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434',
  tei: 'http://localhost:8082/v1'
}

const MODEL_HINTS: Record<string, string[]> = {
  openai: ['text-embedding-3-small', 'text-embedding-3-large'],
  mistral: ['mistral-embed'],
  gemini: ['gemini-embedding-001'],
  openrouter: ['openai/text-embedding-3-small', 'qwen/qwen3-embedding-8b', 'baai/bge-m3'],
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
    // The list of models of a hosted provider that publishes one is read as soon as it is chosen.
    if (provider === 'openrouter') void detectModels(provider, BASE_URLS[provider])
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
  const readyProvider = (id: string) => providers.find((item) => item.has_api_key && (PROVIDER_KINDS[id] ?? []).includes(item.provider.toLowerCase()))
  const ready = (id: string, fallback: string) => (readyProvider(id) ? `Uses your ${readyProvider(id)?.name} provider` : fallback)
  const providerOptions: SelectOption[] = [
    { value: 'tei', label: 'TEI local', description: 'Local embeddings server', icon: <ProviderIcon provider="tei" size={24} /> },
    { value: 'ollama', label: 'Ollama local', description: 'Local Ollama models', icon: <ProviderIcon provider="ollama" size={24} /> },
    { value: 'openai', label: 'OpenAI', description: ready('openai', 'OpenAI embeddings API'), icon: <ProviderIcon provider="openai" size={24} /> },
    { value: 'mistral', label: 'Mistral', description: ready('mistral', 'Mistral embeddings API'), icon: <ProviderIcon provider="mistral" size={24} /> },
    { value: 'gemini', label: 'Google Gemini', description: ready('gemini', 'Gemini OpenAI-compatible endpoint'), icon: <ProviderIcon provider="gemini" size={24} /> },
    { value: 'openrouter', label: 'OpenRouter', description: ready('openrouter', 'Dozens of embedding models, one key'), icon: <ProviderIcon provider="openrouter" size={24} /> }
  ]

  return (
    <ConfigCard
      title="Embeddings"
      description="Configure the vector model used when files are ingested and searched."
      status={<StatusPill tone={config?.is_configured ? 'ok' : 'warn'}>{config?.is_configured ? 'Ready' : 'Review'}</StatusPill>}
      action={<ToggleSwitch enabled={form.enabled} onChange={(enabled) => update('enabled', enabled)} />}
    >
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[250px_minmax(0,1fr)]">
          <Field label="Provider">
            <CustomSelect value={form.provider} options={providerOptions} onChange={chooseProvider} />
          </Field>
          <Field label="Base URL">
            <TextInput value={form.base_url} onChange={(event) => update('base_url', event.target.value)} placeholder="http://localhost:8082/v1" />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="Model">
            <ModelCombobox value={form.model} options={suggestions} onChange={(model) => update('model', model)} placeholder="text-embedding-3-small" />
          </Field>
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
            emptyPlaceholder="Optional local"
          />
        </div>

        {changesModel && (
          <div className="flex gap-3 rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/8 px-3.5 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5v.01" />
            </svg>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-[var(--text-primary)]">Documents already indexed use {config?.model}</div>
              <p className="m-0 mt-0.5 text-[12px] leading-[18px] text-[var(--text-muted)]">
                Once saved, their vectors will not match this model: the search by meaning is wrong until you make them again (a button appears after saving). The search by words keeps working.
              </p>
            </div>
          </div>
        )}

        {isFreeModel(form.model) && <FreeModelNote what="embedding" />}

        <ReembedPanel config={config} unsaved={dirty} onDone={refreshConfig} />

        <ResultMessage state={testing} error={testError} latency={latency} />

        <div className="flex flex-wrap items-center gap-2">
          {(form.provider === 'tei' || form.provider === 'ollama') && (
            <SoftButton type="button" onClick={() => void detectModels()} disabled={detecting || !form.base_url}>
              {detecting ? 'Detecting...' : 'Detect models'}
            </SoftButton>
          )}
          <SoftButton type="button" onClick={() => void test()} disabled={!form.base_url || !form.model || testing === 'running'}>
            {testing === 'running' ? 'Testing...' : 'Test'}
          </SoftButton>
          <SoftButton type="button" tone={dirty ? 'primary' : 'success'} onClick={() => void save()} disabled={!dirty || saving} className="ml-auto">
            {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
          </SoftButton>
        </div>
      </div>
    </ConfigCard>
  )
}
