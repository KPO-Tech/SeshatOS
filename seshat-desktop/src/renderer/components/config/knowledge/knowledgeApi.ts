import { api } from '@renderer/api/client'
import type { Corpus, DocumentReaderConfig, EmbedderConfig, IndraStatusResult, NativeDocDownloadResult, NativeDocInitResult, NativeDocStatusResult, ReembedStatus, RerankerConfig, RerankerModel, StorageStatus, SystemStatus, TestResult } from './knowledgeTypes'

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

export type DocumentsSnapshot = {
  documentReader: DocumentReaderConfig | null
  system: SystemStatus | null
}

/** What the Documents section of Config needs: the document reader settings and the state of the reading engines. */
export async function fetchDocumentsSnapshot(): Promise<DocumentsSnapshot> {
  const [documentReader, system] = await Promise.all([
    api.get<DocumentReaderConfig>('/settings/document-reader').catch(() => null),
    api.get<SystemStatus>('/system/status').catch(() => null)
  ])
  return { documentReader, system }
}

export function saveEmbedderConfig(config: {
  provider: string
  base_url: string
  model: string
  enabled: boolean
  api_key?: string
  // Takes the key of one of the person's providers (Config > Providers) instead of a key typed here.
  provider_setting_id?: string
}) {
  return api.put<EmbedderConfig>('/settings/embedder', config)
}

export function testEmbedderConfig(config: {
  provider: string
  base_url: string
  model: string
  api_key?: string
  provider_setting_id?: string
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
  provider_setting_id?: string
}) {
  return api.put<RerankerConfig>('/settings/reranker', config)
}

export function testRerankerConfig(config: {
  base_url: string
  model: string
  api_key?: string
  provider_setting_id?: string
}) {
  return api.post<TestResult>('/settings/reranker/test', config)
}

/** The rerank models a hosted provider offers (OpenRouter's from its own listing); an error says why the list is not the live one. */
export function listRerankerModels(config: { provider: string }) {
  return api.post<{ models: string[]; error: string | null }>('/settings/reranker/list-models', config)
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

export function downloadNativeDocumentReaderModels(pack?: string) {
  return api.post<NativeDocDownloadResult>('/settings/document-reader/native/download', pack ? { pack } : {})
}

export function fetchIndraStatus() {
  return api.get<IndraStatusResult>('/settings/document-reader/indra/status')
}

/** Installs Indra OCR in the background. The licence must be accepted: `license_version` is the text that was shown. */
export function installIndra(licenseVersion: string) {
  return api.post<IndraStatusResult>('/settings/document-reader/indra/install', { accept_license: true, license_version: licenseVersion })
}

export function setIndraEnabled(enabled: boolean) {
  return api.post<IndraStatusResult>('/settings/document-reader/indra/enabled', { enabled })
}

export function removeIndra() {
  return api.post<IndraStatusResult>('/settings/document-reader/indra/remove', {})
}

export function listRerankerSetups() {
  return api.get<{ models: RerankerModel[] }>('/settings/reranker/models')
}

/** Sets a rerank model up; with `use`, it becomes the one the search uses. Returns the list as it is after. */
export function addRerankerSetup(config: { base_url: string; model: string; api_key?: string; provider_setting_id?: string; use?: boolean }) {
  return api.post<{ models: RerankerModel[] }>('/settings/reranker/models', config)
}

export function useRerankerSetup(id: string) {
  return api.post<{ models: RerankerModel[] }>(`/settings/reranker/models/${encodeURIComponent(id)}/use`, {})
}

export function removeRerankerSetup(id: string) {
  return api.delete<{ models: RerankerModel[] }>(`/settings/reranker/models/${encodeURIComponent(id)}`)
}

export function getReembedStatus() {
  return api.get<ReembedStatus>('/knowledge/reembed')
}

/** Makes the vectors of every collection again with the model now in use, in the background. */
export function startReembed() {
  return api.post<ReembedStatus>('/knowledge/reembed')
}

export function stopReembed() {
  return api.delete<ReembedStatus>('/knowledge/reembed')
}
