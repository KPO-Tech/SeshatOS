import { api } from '@renderer/api/client'
import type { CloudStatus } from './cloudTypes'

export function fetchCloudStatus() {
  return api.get<CloudStatus>('/cloud/status')
}

export function registerCloudDevice(name?: string) {
  return api.post<CloudStatus>('/cloud/register-device', { name })
}

export function connectCloudDevice(server_url: string, device_token: string) {
  return api.post<CloudStatus>('/cloud/connect', { server_url, device_token })
}

export function disconnectCloudDevice() {
  return api.post('/cloud/disconnect', {})
}
