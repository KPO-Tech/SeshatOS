import { api } from '@renderer/api/client'
import type { Corpus, DocumentReaderConfig, EmbedderConfig, NativeDocDownloadResult, NativeDocInitResult, NativeDocStatusResult, RerankerConfig, StorageStatus, SystemStatus, TestResult } from './knowledgeTypes'

export type KnowledgeSnapshot = {
  corpora: Corpus[]
  embedder: EmbedderConfig | null
  reranker: RerankerConfig | null
  documentReader: DocumentReaderConfig | null
  storage: StorageStatus | null
  system: SystemStatus | null
}

export async function fetchKnowledgeSnapshot(): Promise<KnowledgeSnapshot> {
  const [corporaData, embedder, reranker, documentReader, storage, system] = await Promise.all([
    api.get<{ corpora: Corpus[]; count: number }>('/corpora').catch(() => ({ corpora: [], count: 0 })),
    api.get<EmbedderConfig>('/settings/embedder').catch(() => null),
    api.get<RerankerConfig>('/settings/reranker').catch(() => null),
    api.get<DocumentReaderConfig>('/settings/document-reader').catch(() => null),
    api.get<StorageStatus>('/settings/storage').catch(() => null),
    api.get<SystemStatus>('/system/status').catch(() => null)
  ])

  return {
    corpora: corporaData?.corpora ?? [],
    embedder,
    reranker,
    documentReader,
    storage,
    system
  }
}

export function saveEmbedderConfig(config: {
  provider: string
  base_url: string
  model: string
  enabled: boolean
  api_key?: string
}) {
  return api.put<EmbedderConfig>('/settings/embedder', config)
}

export function testEmbedderConfig(config: {
  provider: string
  base_url: string
  model: string
  api_key?: string
}) {
  return api.post<TestResult>('/settings/embedder/test', config)
}

export function detectEmbedderModels(config: { provider: string; base_url: string }) {
  return api.post<{ embedding_models: string[]; error?: string }>('/settings/embedder/detect-models', config)
}

export function saveRerankerConfig(config: {
  base_url: string
  model: string
  enabled: boolean
  api_key?: string
}) {
  return api.put<RerankerConfig>('/settings/reranker', config)
}

export function testRerankerConfig(config: {
  base_url: string
  model: string
  api_key?: string
}) {
  return api.post<TestResult>('/settings/reranker/test', config)
}

export function detectRerankerModel(config: { base_url: string }) {
  return api.post<{ model: string; error: string | null }>('/settings/reranker/detect-model', config)
}

export function saveDocumentReaderConfig(config: { base_url: string; enabled: boolean; prefer_external: boolean }) {
  return api.put<DocumentReaderConfig>('/settings/document-reader', config)
}

export function testDocumentReaderConfig(config: { base_url: string }) {
  return api.post<TestResult>('/settings/document-reader/test', config)
}

export function initializeNativeDocumentReader() {
  return api.post<NativeDocInitResult>('/settings/document-reader/native/init', {})
}

export function fetchNativeDocumentReaderStatus() {
  return api.get<NativeDocStatusResult>('/settings/document-reader/native/status')
}

export function downloadNativeDocumentReaderModels() {
  return api.post<NativeDocDownloadResult>('/settings/document-reader/native/download', {})
}
