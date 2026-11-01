import { useEffect, useState } from 'react'
import { downloadNativeDocumentReaderModels, fetchNativeDocumentReaderStatus, initializeNativeDocumentReader, saveDocumentReaderConfig, testDocumentReaderConfig } from '../knowledge/knowledgeApi'
import type { DocumentReaderConfig, NativeDocDownloadState, NativeDocModelStatus, NativeDocPack, SystemStatus, TestState } from '../knowledge/knowledgeTypes'

type Options = {
  config: DocumentReaderConfig | null
  system: SystemStatus | null
  onSaved: (config: DocumentReaderConfig) => void
  onSystemChanged?: (system: Partial<SystemStatus>) => void
}

/** What the person sees of the test of an external reader. */
export type ReaderTest = {
  state: TestState
  error: string | null
  latency: number | null
  capabilities: { reachable?: boolean; conversion?: boolean; conversionError?: string | null; hybrid?: boolean; hybridError?: string | null } | null
}

/**
 * Everything the Documents page does: the settings of the document reader (to save), the test of an external server, and the reading of
 * scanned pages on this computer (its models, the languages, their download and the start of the OCR).
 */
export function useDocumentReader({ config, system, onSaved, onSystemChanged }: Options) {
  const [form, setForm] = useState({ base_url: config?.base_url || '', enabled: config?.enabled ?? true, prefer_external: config?.prefer_external ?? false })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [test, setTest] = useState<ReaderTest>({ state: 'idle', error: null, latency: null, capabilities: null })
  const [initializingNative, setInitializingNative] = useState(false)
  const [downloadingNative, setDownloadingNative] = useState(false)
  const [nativeDownload, setNativeDownload] = useState<NativeDocDownloadState | null>(null)
  const [nativeModelDir, setNativeModelDir] = useState<string | null>(null)
  const [nativePacks, setNativePacks] = useState<NativeDocPack[]>([])
  const [nativeModels, setNativeModels] = useState<NativeDocModelStatus[]>([])
  const [selectedPack, setSelectedPack] = useState<string | null>(null)
  const [nativeInitError, setNativeInitError] = useState<string | null>(null)

  useEffect(() => {
    if (config) setForm({ base_url: config.base_url || '', enabled: config.enabled, prefer_external: config.prefer_external ?? false })
  }, [config])

  useEffect(() => {
    let cancelled = false
    async function loadNativeStatus() {
      try {
        const status = await fetchNativeDocumentReaderStatus()
        if (cancelled) return
        setNativeModelDir(status.model_dir)
        setNativeDownload(status.download)
        setNativePacks(status.packs ?? [])
        setNativeModels(status.model_status ?? [])
        setSelectedPack((current) => current ?? status.active_pack ?? null)
        onSystemChanged?.(status.capabilities)
        if (status.download.status === 'running') {
          setDownloadingNative(true)
          await pollNativeDownload(() => cancelled)
        }
      } catch {
        // Native status is advisory; the rest of the document-reader settings stay usable even if this probe fails.
      }
    }
    void loadNativeStatus()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setTest({ state: 'idle', error: null, latency: null, capabilities: null })
  }

  async function runTest() {
    setTest({ state: 'running', error: null, latency: null, capabilities: null })
    try {
      const result = await testDocumentReaderConfig({ base_url: form.base_url })
      setTest({
        state: result.ok ? 'ok' : 'error',
        error: result.error,
        latency: result.latency_ms,
        capabilities: {
          reachable: result.document_reader_reachable,
          conversion: result.document_conversion_available,
          conversionError: result.document_conversion_error,
          hybrid: result.document_hybrid_chunking_configured,
          hybridError: result.document_hybrid_chunking_error
        }
      })
    } catch (error) {
      setTest({ state: 'error', error: (error as { message?: string })?.message ?? 'The test of the document reader failed.', latency: null, capabilities: null })
    }
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      onSaved(await saveDocumentReaderConfig(form))
      setDirty(false)
    } catch (error) {
      setSaveError((error as { message?: string })?.message ?? 'Failed to save the document reader settings.')
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
      if (!result.ok) setNativeInitError(result.error ?? 'Native OCR is not ready.')
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
      const started = await downloadNativeDocumentReaderModels(selectedPack ?? undefined)
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
      setNativePacks(status.packs ?? [])
      setNativeModels(status.model_status ?? [])
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

  // What the system says about each reader, with the answers it gives when it says nothing yet.
  const externalConfigured = system?.document_external_configured ?? Boolean(form.enabled && form.base_url)
  const externalReachable = system?.document_reader_reachable
  const externalConversion = system?.document_external_conversion_available
  const hybridConfigured = system?.document_hybrid_chunking_configured ?? externalConfigured
  const localBasicAvailable = system?.document_local_basic_available ?? system?.document_conversion_available !== false
  const pdfSmartAvailable = system?.document_pdfsmart_available ?? system?.document_conversion_available !== false
  const nativeDocCompiled = system?.document_nativedoc_compiled === true
  const nativeDocInitialized = system?.document_nativedoc_runtime_initialized === true
  const nativeDocModels = system?.document_nativedoc_models_available === true
  const nativeDocReady = system?.document_nativedoc_ready === true
  const visionConfigured = system?.document_vision_fallback_configured === true
  const chosenPack = nativePacks.find((pack) => pack.id === selectedPack) ?? null
  const chosenPackReady = chosenPack ? chosenPack.installed && chosenPack.active : nativeDocModels

  return {
    form,
    update,
    dirty,
    saving,
    saveError,
    save,
    test,
    runTest,
    // The readers.
    externalConfigured,
    externalReachable,
    externalConversion,
    externalConversionError: system?.document_external_conversion_error,
    hybridConfigured,
    hybridError: system?.document_hybrid_chunking_error,
    localBasicAvailable,
    pdfSmartAvailable,
    visionConfigured,
    // The reading of scanned pages on this computer.
    native: {
      compiled: nativeDocCompiled,
      ready: nativeDocReady,
      hasModels: nativeDocModels,
      initialized: nativeDocInitialized,
      detail: nativeDocReady ? 'Ready' : !nativeDocCompiled ? 'Not in this version' : !nativeDocModels ? 'Needs models' : !nativeDocInitialized ? 'Needs runtime' : 'Unavailable',
      message: nativeDocReady
        ? 'Native OCR is ready for local scanned PDFs.'
        : !nativeDocCompiled
          ? 'This version of SeshatOS has no built-in reader for scanned documents (the macOS version does not have it yet). The optional Indra reader can read them.'
          : !nativeDocModels
            ? 'Download the models before starting native OCR.'
            : 'The models are present. Start native OCR to read scanned PDFs on this computer.',
      canInitialize: nativeDocCompiled && nativeDocModels && !nativeDocReady,
      initializing: initializingNative,
      initError: nativeInitError,
      initialize: initializeNative,
      downloading: downloadingNative,
      canDownload: !chosenPackReady && !downloadingNative,
      buttonLabel: downloadingNative ? 'Downloading...' : chosenPackReady ? 'Models detected' : chosenPack?.installed ? 'Use this recognizer' : 'Download models',
      download: nativeDownload,
      startDownload: downloadNativeModels,
      modelDir: nativeModelDir,
      packs: nativePacks,
      models: nativeModels,
      selectedPack,
      selectPack: setSelectedPack
    }
  }
}

export type DocumentReaderState = ReturnType<typeof useDocumentReader>
