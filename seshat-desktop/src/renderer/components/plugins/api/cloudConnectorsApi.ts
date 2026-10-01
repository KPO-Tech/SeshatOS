import { api } from '@renderer/api/client'

// The subset of seshat-server's connector account (relayed by seshat-backend)
// the plugin panels need. No organization id is ever sent from here: the local
// backend injects it from the session.
export type CloudConnectorAccount = {
  id: string
  kind: string
  display_name: string
  status: string
  last_error?: string
}

export async function fetchMyConnectorAccounts() {
  const result = await api.get<{ connector_accounts: CloudConnectorAccount[] }>('/connectors/my-accounts')
  return result.connector_accounts ?? []
}

export function startCloudOAuth(kind: string, displayName: string) {
  return api.post<{ authorization_url: string }>(`/connectors/${kind}/oauth/start`, { display_name: displayName })
}

export function connectStaticAccount(kind: string, secret: string, displayName: string) {
  return api.post<CloudConnectorAccount>(`/connectors/${kind}/static-account`, { secret, display_name: displayName })
}

export function disconnectMyConnectorAccount(id: string) {
  return api.delete(`/connectors/my-accounts/${id}`)
}
