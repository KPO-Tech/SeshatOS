import { useEffect } from 'react'
import { api } from '@renderer/api/client'
import type { Session } from '@renderer/api/types'
import { normalizeSessionMessages } from '@renderer/lib/chat'
import { useSessionStore, type ChatSession, type ChatAttachment } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'

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
    void api.get<Session>(`/sessions/${sessionId}`)
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
      })
      .catch(() => {
        // Leave the existing "Conversation not found" UI path if the fetch fails.
      })

    return () => {
      cancelled = true
    }
  }, [sessionHasData, sessionId, setActive, upsertSession])
}
