import { api } from '@renderer/api/client'

type ConnectorTool = {
  name: string
  description?: string
}

// A connector of the backend's local catalog, with where it stands for this person.
export type LocalConnector = {
  kind: string
  label: string
  description: string
  category: string
  credential_label: string
  credential_url?: string
  docs_url?: string
  status: 'connected' | 'error' | 'disconnected'
  last_error?: string
  tools: ConnectorTool[]
}

export async function fetchLocalConnectors(): Promise<LocalConnector[]> {
  const result = await api.get<{ connectors: LocalConnector[]; count: number }>('/connectors/catalog')
  return result.connectors ?? []
}

// Keeps the key, loads the connector's tools and answers with the connector as it now stands (connected, or in error with the reason).
export function connectLocalConnector(kind: string, key: string) {
  return api.put<LocalConnector>(`/connectors/${kind}/connection`, { key })
}

export function disconnectLocalConnector(kind: string) {
  return api.delete(`/connectors/${kind}/connection`)
}
