import { api } from '@renderer/api/client'

export type InboxChannel = 'gmail' | 'outlook' | 'teams' | 'whatsapp'

export type InboxAccount = {
  id: string
  channel: string
  display_name?: string
  external_account_id?: string
  status: string
  last_synced_at?: number
  last_error?: string
}

export async function fetchInboxAccounts() {
  const result = await api.get<{ accounts: InboxAccount[] }>('/inbox/accounts')
  return result.accounts ?? []
}

export function startInboxOAuth(channel: InboxChannel) {
  return api.post<{ authorization_url: string }>(`/inbox/accounts/${channel}/oauth/start`)
}

export function disconnectInboxAccount(id: string) {
  return api.delete(`/inbox/accounts/${id}`)
}

export function syncInboxAccount(id: string) {
  return api.post(`/inbox/accounts/${id}/sync`)
}
