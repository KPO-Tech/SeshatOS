import { api } from '@renderer/api/client'

export type SandboxMode = 'docker' | 'local' | 'project'

export type SandboxConfig = {
  mode: SandboxMode
  updated_at?: number
  project_available?: boolean
  project_unavailable_reason?: string
  deny_read?: string[]
}

export function fetchSandboxConfig(): Promise<SandboxConfig | null> {
  return api.get<SandboxConfig>('/settings/sandbox').catch(() => null)
}

export function saveSandboxMode(mode: SandboxMode): Promise<SandboxConfig> {
  return api.put<SandboxConfig>('/settings/sandbox', { mode })
}

export function saveProtectedPaths(paths: string[]): Promise<SandboxConfig> {
  return api.put<SandboxConfig>('/settings/sandbox', { deny_read: paths })
}

// Cached read for callers that just need to know where commands run without
// caring about update timestamps - avoids a settings round trip
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
