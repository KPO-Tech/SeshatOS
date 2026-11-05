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
      title: connected ? 'knowledge/ask:pages.knowledge.ask.askReadiness.cloudUnreachable' : 'knowledge/ask:pages.knowledge.ask.askReadiness.notAnswering',
      text: connected
        ? 'knowledge/ask:pages.knowledge.ask.askReadiness.orgCollectionsFailed'
        : 'knowledge/ask:pages.knowledge.ask.askReadiness.localCollectionsFailed',
      action: { id: 'retry', label: 'knowledge/ask:pages.knowledge.ask.askReadiness.tryAgain' }
    }
  }
  if (collectionCount > 0) return null
  return {
    kind: 'empty',
    title: 'knowledge/ask:pages.knowledge.ask.askReadiness.noDocuments',
    text: canManage
      ? 'knowledge/ask:pages.knowledge.ask.askReadiness.addSourceText'
      : 'knowledge/ask:pages.knowledge.ask.askReadiness.noneShared',
    action: canManage ? { id: 'add-source', label: 'knowledge/ask:pages.knowledge.ask.askReadiness.addSource' } : undefined
  }
}

/** What will make the answers worse without stopping them, from the embedding settings. */
export function askNotices({ embedder, canManage }: Pick<AskReadinessInput, 'embedder' | 'canManage'>): AskNotice[] {
  if (!embedder) return []
  const action = canManage ? { id: 'setup-search' as const, label: 'knowledge/ask:pages.knowledge.ask.askReadiness.openSearchSettings' } : undefined
  if (!embedder.enabled || !embedder.is_configured) {
    return [
      {
        id: 'no-embedder',
        title: 'knowledge/ask:pages.knowledge.ask.askReadiness.meaningOff',
        text: 'knowledge/ask:pages.knowledge.ask.askReadiness.meaningOffText',
        action
      }
    ]
  }
  if (embedder.vectors_stale) {
    return [
      {
        id: 'vectors-stale',
        title: 'knowledge/ask:pages.knowledge.ask.askReadiness.staleTitle',
        text: 'knowledge/ask:pages.knowledge.ask.askReadiness.staleText',
        action: canManage ? { id: 'setup-search', label: 'knowledge/ask:pages.knowledge.ask.askReadiness.indexAgain' } : undefined
      }
    ]
  }
  return []
}
