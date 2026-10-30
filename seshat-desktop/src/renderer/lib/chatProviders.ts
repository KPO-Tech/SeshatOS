import type { ProviderSetting } from '@renderer/api/types'

/** Whether a provider can answer a chat now: a local one, a signed-in account, or a key or a connection that was checked. */
export function isChatProviderUsable(provider: ProviderSetting): boolean {
  if (provider.provider === 'ollama') return true
  if (provider.auth_kind === 'oauth') return provider.connection_status === 'connected'
  return provider.has_api_key || provider.connection_status === 'ready'
}
