import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { Session } from '@renderer/api/types'
import { normalizeSessionMessages } from '@renderer/lib/chat'
import { useSessionStore, type ChatSession, type ChatAttachment } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'

// Same reasoning as useSessionsSync's retry: the renderer can start before
// the local backend finishes booting, so a GET /sessions/:id that fails
// right after launch usually isn't "this conversation doesn't exist" - it's
// "ask again in a moment." Only treated as genuinely not-found once every
// attempt has failed.
const MAX_ATTEMPTS = 5
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000]

type SendMessage = (
  prompt: string,
  options?: {
    fileIds?: string[]
    attachments?: ChatAttachment[]
    agentSlug?: string
  }
) => void | Promise<unknown>

type UseConversationSessionLoadArgs = {
  sessionId?: string
  session?: ChatSession
  updateSession: (id: string, patch: Partial<ChatSession>) => void
  sendMessage: SendMessage
  setInputValue: (value: string) => void
}

export function useConversationSessionLoad({
  sessionId,
  session,
  updateSession,
  sendMessage,
  setInputValue,
}: UseConversationSessionLoadArgs) {
  const upsertSession = useSessionStore((s) => s.upsertSession)
  const setActive = useSessionStore((s) => s.setActive)
  const sessionHasData = Boolean(session && (session.messages.length > 0 || session.draftPrompt))
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!session?.draftPrompt || !session.id) return
    const draft = session.draftPrompt
    const draftAgentSlug = session.draftAgentSlug
    const draftFileIds = session.draftFileIds
    const draftAttachments = session.draftAttachments
    updateSession(session.id, { draftPrompt: undefined, draftAgentSlug: undefined, draftFileIds: undefined, draftAttachments: undefined })
    if (session.messages.length === 0) {
      void sendMessage(draft, { fileIds: draftFileIds, attachments: draftAttachments, agentSlug: draftAgentSlug })
      return
    }
    setInputValue(draft)
  }, [sendMessage, session?.draftPrompt, session?.draftAgentSlug, session?.draftFileIds, session?.draftAttachments, session?.id, session?.messages.length, setInputValue, updateSession])

  useEffect(() => {
    if (!sessionId) return
    if (sessionHasData) return

    let cancelled = false
    setLoading(true)
    setLoadFailed(false)

    function attempt(attemptsLeft: number) {
      api.get<Session>(`/sessions/${sessionId}`)
        .then((detail) => {
          if (cancelled) return
          // Guard: the session may have been deleted while the fetch was in flight.
          const { sessions } = useSessionStore.getState()
          if (!sessions.find((s) => s.id === detail.session_id)) return
          upsertSession({
            id: detail.session_id,
            title: detail.title || 'Untitled conversation',
            messages: normalizeSessionMessages(detail.messages ?? []),
            createdAt: new Date((detail.created_at ?? 0) * 1000).toISOString(),
            providerSettingId: detail.provider_setting_id,
            modelId: detail.model_id,
            permissionMode: detail.permission_mode,
            executionOrigin: detail.execution_origin,
            workspacePath: detail.workspace_path,
            projectPath: detail.project_path,
          })
          if (detail.permission_mode) {
            useUIStore.getState().setPermissionMode(detail.permission_mode as import('@renderer/stores/ui').UIPermissionMode)
          }
          setActive(detail.session_id)
          setLoading(false)
        })
        .catch(() => {
          if (cancelled) return
          if (attemptsLeft <= 1) {
            setLoading(false)
            setLoadFailed(true)
            return
          }
          const delay = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - attemptsLeft] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
          setTimeout(() => {
            if (!cancelled) attempt(attemptsLeft - 1)
          }, delay)
        })
    }

    attempt(MAX_ATTEMPTS)
    return () => {
      cancelled = true
    }
  }, [sessionHasData, sessionId, setActive, upsertSession])

  return {
    // True only while actively trying to load a session we don't have data
    // for yet - never true once sessionHasData, so it can't get stuck on
    // from a stale previous id (keying the route on id also handles this,
    // but this hook shouldn't depend on that to be correct).
    loading: loading && !sessionHasData,
    loadFailed,
  }
}
