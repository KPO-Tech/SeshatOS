import { api } from '@renderer/api/client'
import type { ConnectAccountPayload, ConnectorAccount, ConnectorActionResult, ConnectorKind, Corpus } from './connectorTypes'

export async function fetchCorpora() {
  const result = await api.get<{ corpora: Corpus[]; count: number }>('/corpora')
  return result.corpora ?? []
}

export async function fetchConnectorAccounts(kind: string, accountPathKind = kind) {
  const result = await api.get<{ accounts: ConnectorAccount[]; count: number }>(`/connectors/${accountPathKind}/accounts`)
  return (result.accounts ?? []).filter((account) => account.kind === kind || accountPathKind === kind)
}

export async function fetchDriveAccounts() {
  const result = await api.get<{ accounts: ConnectorAccount[]; count: number }>('/knowledge/connectors/gdrive/accounts')
  return result.accounts ?? []
}

export function startConnectorOAuth(path: string) {
  return api.post<{ authorization_url: string }>(path, {})
}

export function connectStaticAccount(kind: string, payload: ConnectAccountPayload) {
  return api.post<ConnectorAccount>(`/connectors/${kind}/accounts`, payload)
}

export function disconnectConnectorAccount(kind: string, id: string) {
  return api.delete(`/connectors/${kind}/accounts/${id}`)
}

export function syncConnectorAccount(kind: ConnectorKind, id: string, corpusId: string) {
  const path = kind === 'gdrive'
    ? `/knowledge/connectors/gdrive/accounts/${id}/sync?corpus_id=${encodeURIComponent(corpusId)}`
    : `/connectors/${kind}/accounts/${id}/sync?corpus_id=${encodeURIComponent(corpusId)}`
  return api.post<{ synced_items: number; ingested: number }>(path, {})
}

export function runConnectorAction(kind: ConnectorKind, id: string, action: string, payload: Record<string, unknown>) {
  return api.post<ConnectorActionResult>(`/connectors/${kind}/accounts/${id}/act`, { action, payload })
}
