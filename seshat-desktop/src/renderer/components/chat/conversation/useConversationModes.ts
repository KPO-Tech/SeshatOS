import { useCallback } from 'react'
import { api } from '@renderer/api/client'
import { useSessionStore, type ChatSession } from '@renderer/stores/session'

type UseConversationModesArgs = {
  sessionId?: string
  updateSession: (id: string, patch: Partial<ChatSession>) => void
}

// Permission mode selection now lives in TitlebarSessionControls (it moved
// out of the per-conversation composer into the titlebar, since it's a
// global setting, not something specific to one conversation) - this hook
// keeps only the modes that are genuinely session-scoped.
export function useConversationModes({
  sessionId,
  updateSession,
}: UseConversationModesArgs) {
  const handleExecutionModeSelect = useCallback((mode: 'execute' | 'plan') => {
    if (!sessionId) return
    useSessionStore.getState().updateAgentState(sessionId, { executionMode: mode })
    void api.patch(`/sessions/${sessionId}`, { execution_mode: mode }).catch(() => {})
  }, [sessionId])

  const handleProjectChange = useCallback((path: string) => {
    if (!sessionId) return
    updateSession(sessionId, { projectPath: path })
    void api.patch(`/sessions/${sessionId}`, { project_path: path }).catch(() => {})
  }, [sessionId, updateSession])

  return {
    handleExecutionModeSelect,
    handleProjectChange,
  }
}
