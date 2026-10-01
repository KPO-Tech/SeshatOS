import { api } from '@renderer/api/client'

export type SandboxMode = 'docker' | 'local'

export type SandboxConfig = {
  mode: SandboxMode
  updated_at?: number
}

export function fetchSandboxConfig(): Promise<SandboxConfig | null> {
  return api.get<SandboxConfig>('/settings/sandbox').catch(() => null)
}

export function saveSandboxMode(mode: SandboxMode): Promise<SandboxConfig> {
  return api.put<SandboxConfig>('/settings/sandbox', { mode })
}

// Cached read for callers that just need to know "local or docker" without
// caring about update timestamps (e.g. deciding whether to proactively
// connect the terminal relay for a session) - avoids a settings round trip
// on every conversation load. Invalidated whenever the setting is saved, so
// a change in Settings > Environment takes effect without a restart.
let cachedMode: Promise<SandboxMode> | null = null

export function currentSandboxMode(): Promise<SandboxMode> {
  if (!cachedMode) {
    cachedMode = fetchSandboxConfig().then((cfg) => cfg?.mode ?? 'local')
  }
  return cachedMode
}

export function invalidateSandboxModeCache() {
  cachedMode = null
}
