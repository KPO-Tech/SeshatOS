import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@renderer/api/client'
import { useChat } from '@renderer/hooks/useChat'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { useSessionStore } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import { deriveTurns } from './askTurns'
import { useDefaultModel } from './useDefaultModel'

// The agent the Ask view talks to: built into seshat-backend (internal/knowledge/agent), with its own prompt and one read-only tool.
export const KNOWLEDGE_AGENT_SLUG = 'knowledge'

const NO_MESSAGES: never[] = []

// A conversation of the Ask view. It is a conversation of the chat, with the Knowledge agent: the chat engine streams, stops, keeps the
// history and the model; this reads its messages as questions, excerpts and answers.
export function useKnowledgeConversation() {
  const { choice, loading: modelLoading, configured } = useDefaultModel()
  const permissionMode = useUIStore((state) => state.permissionMode)
  const addSession = useSessionStore((state) => state.addSession)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const waiting = useRef<{ question: string; collectionId: string | null } | null>(null)

  const { sendMessage, stopMessage, isStreaming } = useChat(sessionId ?? '')
  const messages = useSessionStore((state) => (sessionId ? state.sessions.find((session) => session.id === sessionId)?.messages : undefined)) ?? NO_MESSAGES
  const turns = useMemo(() => deriveTurns(messages, isStreaming), [messages, isStreaming])

  // The first question waits for the conversation to exist, so that the chat hook is bound to it when it is sent.
  useEffect(() => {
    const question = waiting.current
    if (!sessionId || !question) return
    waiting.current = null
    void sendMessage(question.question, { agentSlug: KNOWLEDGE_AGENT_SLUG, corpusId: question.collectionId })
  }, [sessionId, sendMessage])

  const ask = useCallback(
    async (question: string, collectionId: string | null) => {
      const text = question.trim()
      if (!text) return
      setStartError(null)
      if (sessionId) {
        await sendMessage(text, { agentSlug: KNOWLEDGE_AGENT_SLUG, corpusId: collectionId })
        return
      }
      if (!choice) {
        setStartError(configured ? 'No model is available yet.' : 'Configure a provider in Settings before asking.')
        return
      }
      try {
        const response = await api.post<{ session_id: string }>('/sessions', {
          provider_setting_id: choice.provider.id,
          model_id: choice.model.model_id,
          permission_mode: permissionMode
        })
        const now = new Date().toISOString()
        addSession({
          id: response.session_id,
          title: UNTITLED_SESSION_TITLE,
          messages: [],
          createdAt: now,
          updatedAt: now,
          providerSettingId: choice.provider.id,
          providerLabel: choice.provider.name,
          modelId: choice.model.model_id,
          modelLabel: choice.model.display_name || choice.model.model_id,
          source: 'knowledge'
        })
        waiting.current = { question: text, collectionId }
        setSessionId(response.session_id)
      } catch (error) {
        setStartError((error as { message?: string })?.message ?? 'The conversation could not be started.')
      }
    },
    [addSession, choice, configured, permissionMode, sendMessage, sessionId]
  )

  const reset = useCallback(() => {
    if (isStreaming) void stopMessage()
    waiting.current = null
    setStartError(null)
    setSessionId(null)
  }, [isStreaming, stopMessage])

  return { turns, busy: isStreaming, ask, stop: stopMessage, reset, startError, modelLoading, configured, hasConversation: sessionId !== null }
}
