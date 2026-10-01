import { api } from '@renderer/api/client'
import type { AutomationJob, AutomationJobParams, AutomationOverview, AutomationRun, AutomationStatus } from './automationTypes'

export function fetchAutomationStatus() {
  return api.get<AutomationStatus>('/automation/status')
}

export async function fetchAutomationRuns() {
  const result = await api.get<{ runs: AutomationRun[]; count: number }>('/automation/runs')
  return result.runs ?? []
}

export async function fetchAutomationJobs() {
  const result = await api.get<{ jobs: AutomationJob[]; count: number }>('/automation/jobs')
  return result.jobs ?? []
}

export function fetchAutomationOverview() {
  return api.get<AutomationOverview>('/automation/overview')
}

export function registerAutomationDevice(name?: string) {
  return api.post<AutomationStatus>('/automation/register-device', { name })
}

export function connectAutomationDevice(server_url: string, device_token: string) {
  return api.post<AutomationStatus>('/automation/connect', { server_url, device_token })
}

export function disconnectAutomationDevice() {
  return api.post('/automation/disconnect', {})
}

export function triggerAutomationJob(id: string) {
  return api.post(`/automation/jobs/${encodeURIComponent(id)}/run`, {})
}

export function createAutomationJob(params: AutomationJobParams) {
  return api.post<AutomationJob>('/automation/jobs', params)
}

export function updateAutomationJob(id: string, params: AutomationJobParams) {
  return api.put<AutomationJob>(`/automation/jobs/${encodeURIComponent(id)}`, params)
}

export function deleteAutomationJob(id: string) {
  return api.delete(`/automation/jobs/${encodeURIComponent(id)}`)
}

export function pauseAutomationJob(id: string) {
  return api.post<AutomationJob>(`/automation/jobs/${encodeURIComponent(id)}/pause`, {})
}

export function resumeAutomationJob(id: string) {
  return api.post<AutomationJob>(`/automation/jobs/${encodeURIComponent(id)}/resume`, {})
}

export async function fetchAutomationJobRuns(id: string) {
  const result = await api.get<{ runs: AutomationRun[] }>(`/automation/jobs/${encodeURIComponent(id)}/runs`)
  return result.runs ?? []
}
