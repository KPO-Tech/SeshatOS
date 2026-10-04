import { useEffect, useState } from 'react'
import { ConfigCard, Field, ResultMessage, SoftButton, StatusPill, TextInput, ToggleSwitch } from './KnowledgePrimitives'
import { downloadNativeDocumentReaderModels, fetchNativeDocumentReaderStatus, initializeNativeDocumentReader, saveDocumentReaderConfig, testDocumentReaderConfig } from './knowledgeApi'
import type { DocumentReaderConfig, NativeDocDownloadState, SystemStatus, TestState } from './knowledgeTypes'

export function DocumentReaderCard({ config, system, onSaved, onSystemChanged }: {
  config: DocumentReaderConfig | null
  system: SystemStatus | null
  onSaved: (config: DocumentReaderConfig) => void
  onSystemChanged?: (system: Partial<SystemStatus>) => void
}) {
  const [form, setForm] = useState({
    base_url: config?.base_url || '',
    enabled: config?.enabled ?? true,
    prefer_external: config?.prefer_external ?? false
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<TestState>('idle')
  const [initializingNative, setInitializingNative] = useState(false)
  const [downloadingNative, setDownloadingNative] = useState(false)
  const [nativeDownload, setNativeDownload] = useState<NativeDocDownloadState | null>(null)
  const [nativeModelDir, setNativeModelDir] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [nativeInitError, setNativeInitError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [testCapabilities, setTestCapabilities] = useState<{
    reachable?: boolean
    conversion?: boolean
    conversionError?: string | null
    hybrid?: boolean
    hybridError?: string | null
  } | null>(null)

  useEffect(() => {
    if (config) {
      setForm({
        base_url: config.base_url || '',
        enabled: config.enabled,
        prefer_external: config.prefer_external ?? false
      })
    }
  }, [config])

  useEffect(() => {
    let cancelled = false
    async function loadNativeStatus() {
      try {
        const status = await fetchNativeDocumentReaderStatus()
        if (cancelled) return
        setNativeModelDir(status.model_dir)
        setNativeDownload(status.download)
        onSystemChanged?.(status.capabilities)
        if (status.download.status === 'running') {
          setDownloadingNative(true)
          await pollNativeDownload(() => cancelled)
        }
      } catch {
        // Native status is advisory; the rest of the document-reader settings
        // should stay usable even if this probe fails.
      }
    }
    void loadNativeStatus()
    return () => {
      cancelled = true
    }
  }, [])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setTesting('idle')
    setTestCapabilities(null)
  }

  async function test() {
    setTesting('running')
    setTestError(null)
    setLatency(null)
    try {
      const result = await testDocumentReaderConfig({ base_url: form.base_url })
      setTesting(result.ok ? 'ok' : 'error')
      setLatency(result.latency_ms)
      setTestError(result.error)
      setTestCapabilities({
        reachable: result.document_reader_reachable,
        conversion: result.document_conversion_available,
        conversionError: result.document_conversion_error,
        hybrid: result.document_hybrid_chunking_configured,
        hybridError: result.document_hybrid_chunking_error
      })
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Document reader test failed.')
      setTestCapabilities(null)
    }
  }

  const externalConfigured = system?.document_external_configured ?? Boolean(form.enabled && form.base_url)
  const externalReachable = system?.document_reader_reachable
  const externalConversion = system?.document_external_conversion_available
  const hybridConfigured = system?.document_hybrid_chunking_configured ?? externalConfigured
  const externalDetail = externalReachable === true ? 'Reachable' : externalReachable === false ? 'Check failed' : externalConfigured ? 'Configured' : 'Optional'
  const hybridDetail = hybridConfigured ? 'Available' : system?.document_hybrid_chunking_error || 'Fallback'
  const localBasicAvailable = system?.document_local_basic_available ?? system?.document_conversion_available !== false
  const pdfSmartAvailable = system?.document_pdfsmart_available ?? system?.document_conversion_available !== false
  const nativeDocCompiled = system?.document_nativedoc_compiled === true
  const nativeDocInitialized = system?.document_nativedoc_runtime_initialized === true
  const nativeDocModels = system?.document_nativedoc_models_available === true
  const nativeDocReady = system?.document_nativedoc_ready === true
  const nativeDocDetail = nativeDocReady ? 'Ready' : !nativeDocCompiled ? 'CGO build needed' : !nativeDocModels ? 'Needs models' : !nativeDocInitialized ? 'Needs runtime' : 'Unavailable'
  const canInitializeNative = nativeDocCompiled && nativeDocModels && !nativeDocReady
  const canDownloadNativeModels = !nativeDocModels && !downloadingNative
  const visionConfigured = system?.document_vision_fallback_configured === true
  const nativeSetupMessage = nativeDocReady
    ? 'Native OCR is ready for local scanned PDFs.'
    : !nativeDocCompiled
      ? nativeDocModels
        ? 'DeepDoc models are present, but the bundled desktop backend was built without CGO/nativedoc support. Start a nativedoc-enabled backend to initialize local OCR.'
        : 'The bundled desktop backend was built without CGO/nativedoc support. Model download is optional until a nativedoc-enabled backend is available.'
      : !nativeDocModels
        ? 'Download DeepDoc models before initializing native OCR.'
        : 'Models are present. Initialize native OCR to enable local scanned-PDF processing.'

  async function save() {
    setSaving(true)
    try {
      const saved = await saveDocumentReaderConfig(form)
      onSaved(saved)
      setDirty(false)
    } catch (error) {
      setTesting('error')
      setTestError((error as { message?: string })?.message ?? 'Failed to save document reader settings.')
    } finally {
      setSaving(false)
    }
  }

  async function initializeNative() {
    setInitializingNative(true)
    setNativeInitError(null)
    try {
      const result = await initializeNativeDocumentReader()
      onSystemChanged?.({
        document_local_basic_available: result.document_local_basic_available,
        document_pdfsmart_available: result.document_pdfsmart_available,
        document_nativedoc_compiled: result.document_nativedoc_compiled,
        document_nativedoc_runtime_initialized: result.document_nativedoc_runtime_initialized,
        document_nativedoc_models_available: result.document_nativedoc_models_available,
        document_nativedoc_ready: result.document_nativedoc_ready,
        document_vision_fallback_configured: result.document_vision_fallback_configured
      })
      if (!result.ok) {
        setNativeInitError(result.error ?? 'Native OCR is not ready.')
      }
    } catch (error) {
      setNativeInitError((error as { message?: string })?.message ?? 'Native OCR initialization failed.')
    } finally {
      setInitializingNative(false)
    }
  }

  async function downloadNativeModels() {
    setDownloadingNative(true)
    setNativeInitError(null)
    try {
      const started = await downloadNativeDocumentReaderModels()
      setNativeModelDir(started.download.model_dir)
      setNativeDownload(started.download)
      onSystemChanged?.(started.capabilities)
      await pollNativeDownload()
    } catch (error) {
      setNativeInitError((error as { message?: string })?.message ?? 'Native OCR model download failed.')
      setDownloadingNative(false)
    }
  }

  async function pollNativeDownload(cancelled: () => boolean = () => false) {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, 900))
      if (cancelled()) return
      const status = await fetchNativeDocumentReaderStatus()
      if (cancelled()) return
      setNativeModelDir(status.model_dir)
      setNativeDownload(status.download)
      onSystemChanged?.(status.capabilities)
      if (status.download.status === 'completed') {
        setDownloadingNative(false)
        return
      }
      if (status.download.status === 'failed') {
        setNativeInitError(status.download.error || 'Native OCR model download failed.')
        setDownloadingNative(false)
        return
      }
    }
  }

  return (
    <ConfigCard
      title="Document reader"
      description="Use an external document intelligence server for OCR, layout-heavy files, and provider-specific conversion."
      status={<StatusPill tone={form.enabled ? 'ok' : 'muted'}>{form.enabled ? 'Enabled' : 'Disabled'}</StatusPill>}
      action={<ToggleSwitch enabled={form.enabled} onChange={(enabled) => update('enabled', enabled)} />}
    >
      <div className="grid gap-4">
        <Field label="Document reader URL">
          <TextInput value={form.base_url} onChange={(event) => update('base_url', event.target.value)} placeholder="http://localhost:5100" />
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-[var(--text-primary)]">Prefer external reader</span>
            <span className="block truncate text-[11px] text-[var(--text-muted)]">External first for reading and chunking, local fallback. Off: local first, chunks cut from the text the local readers write.</span>
          </span>
          <ToggleSwitch enabled={form.prefer_external} onChange={(preferExternal) => update('prefer_external', preferExternal)} />
        </label>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Capability label="Local basic" ready={localBasicAvailable} detail={localBasicAvailable ? 'Built-in readers' : 'Review'} />
          <Capability label="PDF smart" ready={pdfSmartAvailable} detail={pdfSmartAvailable ? 'Page-aware PDFs' : 'Unavailable'} />
          <Capability label="Native OCR" ready={nativeDocReady} detail={nativeDocDetail} />
          <Capability label="Vision fallback" ready={visionConfigured} detail={visionConfigured ? 'Configured' : 'Later'} />
        </div>
        {nativeModelDir && (
          <div className="truncate rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)]">
            Models: {nativeModelDir}
          </div>
        )}
        <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-muted)]">
          {nativeSetupMessage}
        </div>
        <div className="flex items-center gap-2">
          <SoftButton type="button" onClick={() => void downloadNativeModels()} disabled={!canDownloadNativeModels}>
            {downloadingNative ? 'Downloading...' : nativeDocModels ? 'Models detected' : 'Download models'}
          </SoftButton>
          <SoftButton type="button" onClick={() => void initializeNative()} disabled={!canInitializeNative || initializingNative} tone={nativeDocReady ? 'success' : 'default'}>
            {initializingNative ? 'Initializing...' : nativeDocReady ? 'Native OCR ready' : 'Initialize native OCR'}
          </SoftButton>
          {nativeInitError && <span className="min-w-0 truncate text-[11px] font-semibold text-[var(--accent-primary)]">{nativeInitError}</span>}
        </div>
        {nativeDownload && nativeDownload.status !== 'idle' && (
          <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-[var(--text-muted)]">
              <span className="truncate">{nativeDownload.status === 'running' ? nativeDownload.current_file || 'Downloading models' : nativeDownload.status}</span>
              <span>{nativeDownload.file_index ?? nativeDownload.files_completed ?? 0}/{nativeDownload.file_count ?? 0} {formatBytes(nativeDownload.bytes_downloaded, nativeDownload.bytes_total)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
              <div
                className="h-full rounded-full bg-[var(--accent-primary)] transition-[width]"
                style={{ width: `${downloadPercent(nativeDownload)}%` }}
              />
            </div>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Capability label="External reader" ready={externalReachable ?? externalConfigured} detail={externalDetail} />
          <Capability label="External conversion" ready={externalConversion ?? externalConfigured} detail={externalConversion === false ? system?.document_external_conversion_error || 'Unavailable' : externalConversion ? 'Available' : externalConfigured ? 'Configured' : 'Optional'} />
          <Capability label="Hybrid chunking" ready={hybridConfigured} detail={hybridDetail} />
        </div>
        <ResultMessage state={testing} error={testError} latency={latency} />
        {testCapabilities && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Capability label="Test health" ready={testCapabilities.reachable === true} detail={testCapabilities.reachable ? 'Reachable' : 'Unreachable'} />
            <Capability label="Test conversion" ready={testCapabilities.conversion === true} detail={testCapabilities.conversion ? 'Available' : testCapabilities.conversionError || 'Unavailable'} />
            <Capability label="Test chunking" ready={testCapabilities.hybrid === true} detail={testCapabilities.hybrid ? 'Available' : testCapabilities.hybridError || 'Unavailable'} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <SoftButton type="button" onClick={() => void test()} disabled={!form.base_url || testing === 'running'}>
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

function downloadPercent(download: NativeDocDownloadState) {
  const fileCount = download.file_count || 0
  if (fileCount <= 0) return 0
  if (download.status === 'completed') return 100
  const completed = Math.max(0, (download.file_index || download.files_completed || 1) - 1)
  const current = download.bytes_total && download.bytes_total > 0 ? (download.bytes_downloaded || 0) / download.bytes_total : 0
  return Math.max(0, Math.min(100, Math.round(((completed + current) / fileCount) * 100)))
}

function formatBytes(done?: number, total?: number) {
  if (!done && !total) return ''
  const left = compactBytes(done || 0)
  if (!total || total <= 0) return left
  return `${left}/${compactBytes(total)}`
}

function compactBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)}GB`
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`
  if (value >= 1024) return `${Math.round(value / 1024)}KB`
  return `${value}B`
}

function Capability({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold text-[var(--text-muted)]">{label}</span>
        <span className={['size-1.5 rounded-full', ready ? 'bg-[var(--accent-success)]' : 'bg-[var(--text-faint)]'].join(' ')} />
      </div>
      <div className={['mt-1 truncate text-[12px] font-semibold', ready ? 'text-[var(--accent-success)]' : 'text-[var(--text-muted)]'].join(' ')}>
        {detail}
      </div>
    </div>
  )
}
