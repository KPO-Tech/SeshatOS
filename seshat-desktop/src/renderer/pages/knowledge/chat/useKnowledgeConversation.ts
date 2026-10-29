import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@renderer/api/client'
import { useChat } from '@renderer/hooks/useChat'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { useSessionStore } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import { useConversationModels } from '@renderer/components/chat/conversation/useConversationModels'
import { isChatProviderUsable } from '@renderer/lib/chatProviders'
import { useProvidersStore } from '@renderer/stores/providers'
import { useConversationSessionLoad } from '@renderer/components/chat/conversation/useConversationSessionLoad'
import { deriveTurns } from './askTurns'

// The agent the Ask view talks to: built into seshat-backend (internal/knowledge/agent), with its own prompt and one read-only tool.
export const KNOWLEDGE_AGENT_SLUG = 'knowledge'

const NO_MESSAGES: never[] = []
const noop = () => undefined

// A conversation of the Ask view. It is a conversation of the chat, with the Knowledge agent: the chat engine streams, stops, keeps the
// history and the model; this reads its messages as questions, excerpts and answers.
export function useKnowledgeConversation() {
  const addSession = useSessionStore((state) => state.addSession)
  const updateSession = useSessionStore((state) => state.updateSession)
  const permissionMode = useUIStore((state) => state.permissionMode)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  // A conversation of the history that was opened: its messages are fetched, which those of a new one never are.
  const [openedId, setOpenedId] = useState<string | null>(null)
  const waiting = useRef<{ question: string; collectionId: string | null } | null>(null)

  const session = useSessionStore((state) => (sessionId ? state.sessions.find((item) => item.id === sessionId) : undefined))
  // The model that writes the answers: the one chosen in the input, which is the default one until another is chosen, and which a
  // conversation already begun changes for its next questions.
  const models = useConversationModels({ sessionId: sessionId ?? undefined, session, updateSession })
  const choice = models.selectedModelChoice
  const configured = useProvidersStore((state) => state.providers.some(isChatProviderUsable))
  const modelLoading = models.loadingModelProviderIds.length > 0 && models.allModelChoices.length === 0

  const { sendMessage, stopMessage, isStreaming } = useChat(sessionId ?? '')
  const messages = useSessionStore((state) => (sessionId ? state.sessions.find((session) => session.id === sessionId)?.messages : undefined)) ?? NO_MESSAGES
  const turns = useMemo(() => deriveTurns(messages, isStreaming), [messages, isStreaming])

  const openedSession = useSessionStore((state) => (openedId ? state.sessions.find((item) => item.id === openedId) : undefined))
  const { loading: loadingSession } = useConversationSessionLoad({ sessionId: openedId ?? undefined, session: openedSession, updateSession, sendMessage, setInputValue: noop })

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
          provider_setting_id: choice.providerId,
          model_id: choice.model.model_id,
          permission_mode: permissionMode,
          // Kept by the server, so that the conversation is the Ask view's after a restart and stays out of the chat's recent list.
          source: 'knowledge'
        })
        const now = new Date().toISOString()
        addSession({
          id: response.session_id,
          title: UNTITLED_SESSION_TITLE,
          messages: [],
          createdAt: now,
          updatedAt: now,
          providerSettingId: choice.providerId,
          providerLabel: choice.providerName,
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
    setOpenedId(null)
    setSessionId(null)
  }, [isStreaming, stopMessage])

  // Goes on with a conversation of the history.
  const open = useCallback(
    (id: string) => {
      if (id === sessionId) return
      if (isStreaming) void stopMessage()
      waiting.current = null
      setStartError(null)
      setOpenedId(id)
      setSessionId(id)
    },
    [isStreaming, sessionId, stopMessage]
  )

  return {
    turns,
    busy: isStreaming,
    ask,
    stop: stopMessage,
    reset,
    open,
    loadingSession,
    startError,
    modelLoading,
    configured,
    hasConversation: sessionId !== null,
    sessionId,
    sendMessage,
    models: { choices: models.allModelChoices, selectedId: models.selectedModelChoiceId, select: models.handleModelSelect, loading: modelLoading }
  }
}
