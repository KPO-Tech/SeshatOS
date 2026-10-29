import type { DeviceMode } from '@renderer/lib/authz'

// What the Ask screen can say before a question is sent. A state that stops the questions replaces the start of the screen and shuts the
// input; a notice does not stop anything, it warns of what will make the answers worse.

/** The part of the embedding settings Ask needs (see components/config/knowledge/knowledgeTypes.ts). */
export type EmbedderState = {
  enabled: boolean
  is_configured: boolean
  vectors_stale?: boolean
}

export type AskAction = 'retry' | 'add-source' | 'setup-search'

export type AskStop = {
  kind: 'unavailable' | 'empty'
  title: string
  text: string
  /** Absent when the person can do nothing about it from here. */
  action?: { id: AskAction; label: string }
}

export type AskNotice = {
  id: 'no-embedder' | 'vectors-stale'
  title: string
  text: string
  action?: { id: AskAction; label: string }
}

export type AskReadinessInput = {
  loading: boolean
  collectionsFailed: boolean
  collectionCount: number
  mode: DeviceMode | null
  canManage: boolean
  /** null when the settings could not be read: nothing is said then, rather than a guess. */
  embedder: EmbedderState | null
}

/** What stops a question being asked: the collections could not be read, or there is none to ask about. null while loading, or when all is well. */
export function askStop({ loading, collectionsFailed, collectionCount, mode, canManage }: AskReadinessInput): AskStop | null {
  if (loading) return null
  if (collectionsFailed) {
    const connected = mode === 'connected'
    return {
      kind: 'unavailable',
      title: connected ? "SeshatCloud can't be reached" : "Knowledge isn't answering",
      text: connected
        ? "The collections of your organization could not be read. Check your connection, then try again."
        : 'The collections of this computer could not be read. Try again; if it keeps happening, restart the app.',
      action: { id: 'retry', label: 'Try again' }
    }
  }
  if (collectionCount > 0) return null
  return {
    kind: 'empty',
    title: 'No documents to ask about yet',
    text: canManage
      ? 'Add a source and Seshat will read its documents. Once they are indexed, you can ask about them here.'
      : 'No collection is shared with you yet. Ask an administrator of your organization to give you access.',
    action: canManage ? { id: 'add-source', label: 'Add a source' } : undefined
  }
}

/** What will make the answers worse without stopping them, from the embedding settings. */
export function askNotices({ embedder, canManage }: Pick<AskReadinessInput, 'embedder' | 'canManage'>): AskNotice[] {
  if (!embedder) return []
  const action = canManage ? { id: 'setup-search' as const, label: 'Open Search settings' } : undefined
  if (!embedder.enabled || !embedder.is_configured) {
    return [
      {
        id: 'no-embedder',
        title: 'Search by meaning is off',
        text: 'Ask finds passages by their words only, so a question that does not use the words of the documents can find nothing.',
        action
      }
    ]
  }
  if (embedder.vectors_stale) {
    return [
      {
        id: 'vectors-stale',
        title: 'The documents were indexed with another model',
        text: 'The search by meaning is wrong until the documents are indexed again with the model now in use.',
        action: canManage ? { id: 'setup-search', label: 'Index again' } : undefined
      }
    ]
  }
  return []
}
