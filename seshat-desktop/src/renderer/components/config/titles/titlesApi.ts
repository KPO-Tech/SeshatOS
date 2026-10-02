import { api } from '@renderer/api/client'

export type LocalTitleConfig = {
  base_url?: string
  model?: string
  enabled: boolean
}

export function fetchLocalTitleConfig() {
  return api.get<LocalTitleConfig>('/settings/local-title').catch(() => null)
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return ''
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  return `${Math.round(bytes / 1_000_000)} MB`
}
