import { api } from '@renderer/api/client'
import type { CapabilityName, CapabilityStatus, LocalSTTConfig, SystemStatus } from './multimodalTypes'

export type MultimodalSnapshot = {
  status: SystemStatus | null
  capabilities: CapabilityStatus[]
  localSTT: LocalSTTConfig | null
}

export async function fetchMultimodalSnapshot(): Promise<MultimodalSnapshot> {
  const [status, capabilityData, localSTT] = await Promise.all([
    api.get<SystemStatus>('/system/status').catch(() => null),
    api.get<{ capabilities: CapabilityStatus[] }>('/settings/capability-links').catch(() => ({ capabilities: [] })),
    api.get<LocalSTTConfig>('/settings/local-stt').catch(() => null)
  ])

  return {
    status,
    capabilities: capabilityData.capabilities ?? [],
    localSTT
  }
}

export function linkCapability(capability: CapabilityName, providerSettingId: string) {
  return api.put<{ ok: boolean }>(`/settings/capability-links/${capability}`, { provider_setting_id: providerSettingId })
}

export function unlinkCapability(capability: CapabilityName) {
  return api.delete<{ ok: boolean }>(`/settings/capability-links/${capability}`)
}

export function saveLocalSTT(config: { base_url: string; enabled: boolean }) {
  return api.put<LocalSTTConfig>('/settings/local-stt', config)
}
