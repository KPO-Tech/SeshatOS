export type CapabilityName = 'image' | 'audio' | 'embeddings'

export type CapabilityCandidate = {
  id: string
  provider: string
  name: string
  base_url?: string
  model?: string
}

export type CapabilityStatus = {
  capability: CapabilityName
  linked_provider_id?: string
  linked_provider?: string
  linked_name?: string
  candidates: CapabilityCandidate[]
}

export type SystemStatus = {
  mode: 'standalone' | 'connected'
  server_url?: string
  sandbox_confined?: boolean
  sandbox_kind?: string
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
  local_stt_configured?: boolean
  image_generation_configured?: boolean
}

export type LocalSTTConfig = {
  base_url: string
  enabled: boolean
  updated_at?: number
}
