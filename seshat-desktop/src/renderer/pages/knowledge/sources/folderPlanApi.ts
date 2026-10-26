import { api } from '@renderer/api/client'

// The collections proposed for a folder of this computer. The plan lives on the backend: the screen names collections by their index in the
// plan it was last given, never a file by its path, and every change answers with the new plan (indexes can move: the list is kept in
// order of name).

export type FolderPlanCollection = {
  index: number
  name: string
  file_count: number
  bytes: number
  folders: string[]
  sample: string[]
}

export type FolderPlan = {
  id: string
  root: string
  listed: number
  collections: FolderPlanCollection[]
  excluded_count: number
  excluded_by_reason: Record<string, number>
  excluded: Array<{ path: string; reason: string }>
  duplicate_count: number
  duplicates: Array<{ path: string; of: string }>
}

export type FolderPlanFiles = { collection: string; total: number; offset: number; files: string[] }

export function analyseFolder(path: string) {
  return api.post<FolderPlan>('/knowledge/folder-plans', { path })
}

export function renameCollection(planId: string, index: number, name: string) {
  return api.patch<FolderPlan>(`/knowledge/folder-plans/${planId}`, { op: 'rename', index, name })
}

export function removeCollection(planId: string, index: number) {
  return api.patch<FolderPlan>(`/knowledge/folder-plans/${planId}`, { op: 'remove', index })
}

export function mergeCollections(planId: string, indexes: number[], name: string) {
  return api.patch<FolderPlan>(`/knowledge/folder-plans/${planId}`, { op: 'merge', indexes, name })
}

export function collectionFiles(planId: string, index: number, offset: number, limit = 100) {
  return api.get<FolderPlanFiles>(`/knowledge/folder-plans/${planId}/files?collection=${index}&offset=${offset}&limit=${limit}`)
}
