import { api } from '@renderer/api/client'

// The places collections come from other than the app itself (a folder of this computer for now). Adding one reads nothing: its
// collections are made later, from an analysis of it. Collections that belong to no source belong to the default one, the app.

export type KnowledgeSource = {
  id: string
  kind: 'local_folder'
  name: string
  root: string
  collectionCount: number
}

type SourceRow = { id: string; kind: string; name: string; root?: string; collection_count?: number }

function toSource(row: SourceRow): KnowledgeSource {
  return { id: row.id, kind: 'local_folder', name: row.name, root: row.root ?? '', collectionCount: row.collection_count ?? 0 }
}

export async function listSources(): Promise<{ sources: KnowledgeSource[]; defaultCount: number }> {
  const data = await api.get<{ default?: { collection_count?: number }; sources?: SourceRow[] }>('/knowledge/sources')
  return { sources: (data.sources ?? []).map(toSource), defaultCount: data.default?.collection_count ?? 0 }
}

export async function addFolderSource(path: string, name: string): Promise<KnowledgeSource> {
  return toSource(await api.post<SourceRow>('/knowledge/sources', { kind: 'local_folder', path, name: name.trim() || undefined }))
}

export async function removeSource(id: string): Promise<void> {
  await api.delete(`/knowledge/sources/${encodeURIComponent(id)}`)
}

/** The id the default source goes by in the address of its page: the collections made in the app have no source id. */
export const DEFAULT_SOURCE_ID = 'seshat'

export function sourcePath(sourceId: string): string {
  return `/knowledge/collections/source/${encodeURIComponent(sourceId)}`
}
