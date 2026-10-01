export type EmbedderConfig = {
  provider: string
  base_url: string
  model: string
  has_api_key: boolean
  enabled: boolean
  is_configured: boolean
  updated_at?: number
}

export type RerankerConfig = {
  base_url: string
  model: string
  has_api_key: boolean
  enabled: boolean
  is_configured: boolean
  updated_at?: number
}

export type DocumentReaderConfig = {
  base_url: string
  enabled: boolean
  prefer_external: boolean
  updated_at?: number
}

export type SystemStatus = {
  mode: 'standalone' | 'connected'
  server_url?: string
  document_reader_configured?: boolean
  document_conversion_available?: boolean
  document_local_basic_available?: boolean
  document_pdfsmart_available?: boolean
  document_nativedoc_compiled?: boolean
  document_nativedoc_runtime_initialized?: boolean
  document_nativedoc_models_available?: boolean
  document_nativedoc_ready?: boolean
  document_vision_fallback_configured?: boolean
  document_external_configured?: boolean
  document_reader_reachable?: boolean
  document_reader_tested_at?: number
  document_external_conversion_available?: boolean
  document_external_conversion_error?: string
  document_hybrid_chunking_configured?: boolean
  document_hybrid_chunking_error?: string
}

export type StorageConfigData = {
  provider: string
  local_path?: string
  s3_endpoint?: string
  s3_bucket?: string
  s3_region?: string
  s3_key_prefix?: string
  has_s3_access_key: boolean
  has_s3_secret_key: boolean
  is_configured: boolean
  updated_at?: number
}

export type StorageStatus = {
  active_provider: string
  config: StorageConfigData
  restart_required: boolean
}

export type Corpus = {
  id: string
  name: string
  description?: string
  file_count?: number
  chunk_count?: number
  created_at?: number
  updated_at?: number
}

export type TestResult = {
  ok: boolean
  latency_ms: number
  error: string | null
  document_reader_reachable?: boolean
  document_conversion_available?: boolean
  document_conversion_error?: string | null
  document_hybrid_chunking_configured?: boolean
  document_hybrid_chunking_error?: string | null
}

export type NativeDocInitResult = {
  ok: boolean
  error: string | null
  document_local_basic_available?: boolean
  document_pdfsmart_available?: boolean
  document_nativedoc_compiled?: boolean
  document_nativedoc_runtime_initialized?: boolean
  document_nativedoc_models_available?: boolean
  document_nativedoc_ready?: boolean
  document_vision_fallback_configured?: boolean
}

export type NativeDocDownloadState = {
  status: 'idle' | 'running' | 'completed' | 'failed'
  current_file?: string
  file_index?: number
  file_count?: number
  bytes_downloaded?: number
  bytes_total?: number
  files_completed?: number
  error?: string
  model_dir: string
}

export type NativeDocStatusResult = {
  model_dir: string
  models: string[]
  download: NativeDocDownloadState
  capabilities: Partial<SystemStatus>
}

export type NativeDocDownloadResult = {
  ok: boolean
  already_running: boolean
  download: NativeDocDownloadState
  capabilities: Partial<SystemStatus>
}

export type TestState = 'idle' | 'running' | 'ok' | 'error'
