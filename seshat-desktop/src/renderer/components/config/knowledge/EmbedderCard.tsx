import { useEffect, useState } from 'react'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { ConfigCard, CustomSelect, Field, ResultMessage, SoftButton, StatusPill, TextInput, ToggleSwitch, type SelectOption } from './KnowledgePrimitives'
import { detectEmbedderModels, saveEmbedderConfig, testEmbedderConfig } from './knowledgeApi'
import type { EmbedderConfig, TestState } from './knowledgeTypes'

const BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  ollama: 'http://localhost:11434',
  tei: 'http://localhost:8082/v1'
}

const MODEL_HINTS: Record<string, string[]> = {
  openai: ['text-embedding-3-small', 'text-embedding-3-large'],
  mistral: ['mistral-embed'],
  gemini: ['gemini-embedding-001'],
  ollama: [],
  tei: []
}

export function EmbedderCard({ config, onSaved }: { config: EmbedderConfig | null; onSaved: (config: EmbedderConfig) => void }) {
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
    setDirty(true)
    setTesting('idle')
  }

  async function detectModels() {
    setDetecting(true)
    setTestError(null)
    try {
      const result = await detectEmbedderModels({ provider: form.provider, base_url: form.base_url })
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
        api_key: form.api_key || undefined
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
        api_key: form.api_key || undefined
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

  const suggestions = detectedModels.length > 0 ? detectedModels : MODEL_HINTS[form.provider] ?? []
  const providerOptions: SelectOption[] = [
    { value: 'tei', label: 'TEI local', description: 'Local embeddings server', icon: <ProviderIcon provider="tei" size={24} /> },
    { value: 'ollama', label: 'Ollama local', description: 'Local Ollama models', icon: <ProviderIcon provider="ollama" size={24} /> },
    { value: 'openai', label: 'OpenAI', description: 'OpenAI embeddings API', icon: <ProviderIcon provider="openai" size={24} /> },
    { value: 'mistral', label: 'Mistral', description: 'Mistral embeddings API', icon: <ProviderIcon provider="mistral" size={24} /> },
    { value: 'gemini', label: 'Google Gemini', description: 'Gemini OpenAI-compatible endpoint', icon: <ProviderIcon provider="gemini" size={24} /> }
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
          <Field label={detectedModels.length > 0 ? `Model (${detectedModels.length} detected)` : 'Model'}>
            <TextInput list="knowledge-embedding-models" value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="text-embedding-3-small" />
            <datalist id="knowledge-embedding-models">
              {suggestions.map((model) => <option key={model} value={model} />)}
            </datalist>
          </Field>
          <Field label="API key">
            <TextInput type="password" value={form.api_key} onChange={(event) => update('api_key', event.target.value)} placeholder={config?.has_api_key ? 'Keep current key' : 'Optional local'} autoComplete="new-password" />
          </Field>
        </div>

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
