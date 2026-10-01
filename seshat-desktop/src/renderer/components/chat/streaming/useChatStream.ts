import { useCallback, useRef } from 'react'
import { api } from '@renderer/api/client'
import { useAuthStore } from '@renderer/stores/auth'
import { streamingToContentBlocks, useSessionStore, type ChatAttachment } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import { handleRuntimeEvent } from '@renderer/components/chat/streaming/runtimeEvents'
import { commitDonePayload } from '@renderer/components/chat/streaming/streamCommit'
import { errorHeading } from '@renderer/components/chat/streaming/streamErrors'
import { reduceStreamChunk } from '@renderer/components/chat/streaming/streamReducers'
import { StreamPresenter } from '@renderer/components/chat/streaming/streamPresenter'
import { consumeBrowserStream, consumeElectronStream, type RetryableError } from '@renderer/components/chat/streaming/streamTransport'
import { pollForGeneratedTitle } from '@renderer/components/chat/streaming/titlePolling'
import {
  abortController as abortSharedController,
  clearController as clearSharedController,
  clearStopRequested,
  isStopRequested,
  markStopRequested,
  registerController,
} from '@renderer/components/chat/streaming/chatControllers'
import { isUntitledSessionTitle } from '@renderer/lib/sessionTitle'
import type { RAGSearchResult } from '@renderer/api/types'
import type { ToolActivity } from '@renderer/stores/session'

const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000
// Ceiling for "the connection looks fine but the server never responds at
// all" - distinct from the network-drop retry above, which only fires on a
// detected disconnect. Mirrors OpenHands' own 150s watchdog precedent.
const WATCHDOG_TIMEOUT_MS = 150_000

export type SendMessageOptions = {
  corpusId?: string | null
  fileIds?: string[]
  attachments?: ChatAttachment[]
  agentSlug?: string
  providerSettingId?: string | null
  modelId?: string | null
}

export type UseChatStreamOptions = {
  onCompaction?: (preTokens: number, postTokens: number) => void
  onTurnSuccess?: () => void
}

export function useChatStream(sessionId: string, options?: UseChatStreamOptions) {
  const isStreaming = useSessionStore((s) => Boolean(s.isStreamingBySession[sessionId]))
  // Tracks a pending requestAnimationFrame for batching assistant-message syncs.
  // Without batching, every SSE token triggers a full store.updateMessage call.
  const syncRafRef = useRef<number | null>(null)
  // Ref (not state) since options.onCompaction is a plain callback the
  // caller may pass a fresh closure for on every render - a ref sidesteps
  // re-subscribing sendMessage's useCallback (scoped to [sessionId]) on
  // every such render while still calling the latest callback.
  const onCompactionRef = useRef<(preTokens: number, postTokens: number) => void>(() => {})
  onCompactionRef.current = options?.onCompaction ?? (() => {})
  // Fires only on a genuinely successful commit (the 'done' payload path) -
  // deliberately NOT tied to isStreaming's falling edge, which also fires on
  // failure and would otherwise show a success flash on an errored turn.
  const onTurnSuccessRef = useRef<() => void>(() => {})
  onTurnSuccessRef.current = options?.onTurnSuccess ?? (() => {})

  const sendMessage = useCallback(async (text: string, opts?: SendMessageOptions) => {
    const store = useSessionStore.getState()
    if (store.isSessionStreaming(sessionId)) return

    const prompt = text.trim()
    if (!prompt) return
    const nowIso = new Date().toISOString()

    const assistantMessageId = crypto.randomUUID()
    const userMessageId = crypto.randomUUID()
    const currentSession = store.sessions.find((session) => session.id === sessionId)
    const isFirstMessage = Boolean(currentSession && currentSession.messages.length === 0 && isUntitledSessionTitle(currentSession.title))
    store.updateSession(sessionId, { updatedAt: nowIso })
    store.addMessage(sessionId, {
      id: userMessageId,
      role: 'user',
      content: [{ type: 'text', text: prompt }],
      metadata: opts?.attachments?.length ? { attachments: opts.attachments } : undefined,
      status: 'sending',
    })
    store.addMessage(sessionId, { id: assistantMessageId, role: 'assistant', content: [] })
    store.setIsStreaming(sessionId, true)
    store.clearStreaming(sessionId)
    store.updateAgentState(sessionId, { isThinking: true, activeTool: null, stage: null })
    const abortController = new AbortController()
    registerController(sessionId, abortController)
    clearStopRequested(sessionId)

    // Watchdog: aborts the turn if no server activity (chunk/runtime event/done)
    // arrives within WATCHDOG_TIMEOUT_MS of the last one - covers the case where
    // the connection never drops (so the retry-on-TypeError path above never
    // triggers) but the server also never responds. Reset on every sign of life,
    // cleared in the outer `finally`.
    let watchdogTimedOut = false
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null
    const resetWatchdog = () => {
      if (watchdogTimer !== null) clearTimeout(watchdogTimer)
      watchdogTimer = setTimeout(() => {
        watchdogTimedOut = true
        abortController.abort()
      }, WATCHDOG_TIMEOUT_MS)
    }
    resetWatchdog()

    // Cancel any stale RAF from a prior message (defensive).
    if (syncRafRef.current !== null) {
      cancelAnimationFrame(syncRafRef.current)
      syncRafRef.current = null
    }

    const token = useAuthStore.getState().token
    const permissionMode = useUIStore.getState().permissionMode
    let committed = false
    let pendingTool: ToolActivity | null = null
    let targetStreaming = store.getStreaming(sessionId)

    // scheduleSync batches assistant-message store updates to once per animation frame.
    // Without this, every streamed token triggers updateMessage + React re-render.
    const scheduleSync = () => {
      if (syncRafRef.current !== null) return
      syncRafRef.current = requestAnimationFrame(() => {
        syncRafRef.current = null
        syncAssistantPlaceholder(sessionId, assistantMessageId, useSessionStore.getState())
      })
    }

    // flushSync cancels any pending RAF and syncs immediately (used at done/error boundaries).
    const flushSync = () => {
      if (syncRafRef.current !== null) {
        cancelAnimationFrame(syncRafRef.current)
        syncRafRef.current = null
      }
      syncAssistantPlaceholder(sessionId, assistantMessageId, useSessionStore.getState())
    }

    const presenter = new StreamPresenter((blocks) => {
      store.setStreaming(sessionId, blocks)
      scheduleSync()
    })

    const flushPresenter = () => {
      presenter.flush(targetStreaming)
      flushSync()
    }

    try {
      let retryAttempt = 0

      while (true) {
        let streamError: unknown = null
        // Set as soon as this attempt observes any real activity from the backend
        // (a runtime event or a content chunk) — proof the agent turn is actually
        // running server-side, and possibly already executing tools with side
        // effects (bash, file writes, external API calls). Once true, a dropped
        // connection must NOT be silently retried by resubmitting the same prompt,
        // since that would start a second, duplicate agent turn on top of the
        // first one instead of resuming it (the backend has no idempotency key).
        let receivedServerActivity = false

        try {
          const body = {
            prompt,
            session_id: sessionId,
            permission_mode: permissionMode,
            ...(opts?.corpusId ? { corpus_id: opts.corpusId } : {}),
            ...(opts?.fileIds?.length ? { file_ids: opts.fileIds } : {}),
            ...(opts?.agentSlug ? { agent_slug: opts.agentSlug } : {}),
            ...(opts?.providerSettingId ? { provider_setting_id: opts.providerSettingId } : {}),
            ...(opts?.modelId ? { model_id: opts.modelId } : {}),
          }
          if (window.nexus?.http) {
            await consumeElectronStream(
              body,
              abortController.signal,
              (donePayload) => {
                if (watchdogTimer !== null) clearTimeout(watchdogTimer)
                flushPresenter()
                commitDonePayload(sessionId, assistantMessageId, donePayload, store)
                openKnowledgePanel(sessionId, donePayload.rag_results)
                store.clearStreaming(sessionId)
                committed = true
                onTurnSuccessRef.current()
                flushSync()
              },
              (runtimeEvent) => {
                receivedServerActivity = true
                resetWatchdog()
                flushPresenter()
                handleRuntimeEvent(sessionId, runtimeEvent, store, (tool) => {
                  pendingTool = tool
                }, () => pendingTool, scheduleSync, onCompactionRef.current)
                targetStreaming = store.getStreaming(sessionId)
                presenter.flush(targetStreaming)
              },
              (streamEvent) => {
                receivedServerActivity = true
                resetWatchdog()
                const nextStreaming = reduceStreamChunk(targetStreaming, streamEvent)
                if (nextStreaming) {
                  targetStreaming = nextStreaming
                  presenter.update(targetStreaming)
                }
              },
              (titleEvent) => {
                if (titleEvent.session_id === sessionId && titleEvent.title) {
                  store.updateSession(sessionId, { title: titleEvent.title })
                }
              },
            )
          } else {
            await consumeBrowserStream(
              body,
              token,
              abortController.signal,
              (donePayload) => {
                if (watchdogTimer !== null) clearTimeout(watchdogTimer)
                flushPresenter()
                commitDonePayload(sessionId, assistantMessageId, donePayload, store)
                openKnowledgePanel(sessionId, donePayload.rag_results)
                store.clearStreaming(sessionId)
                committed = true
                onTurnSuccessRef.current()
                flushSync()
              },
              (runtimeEvent) => {
                receivedServerActivity = true
                resetWatchdog()
                flushPresenter()
                handleRuntimeEvent(sessionId, runtimeEvent, store, (tool) => {
                  pendingTool = tool
                }, () => pendingTool, scheduleSync, onCompactionRef.current)
                targetStreaming = store.getStreaming(sessionId)
                presenter.flush(targetStreaming)
              },
              (streamEvent) => {
                receivedServerActivity = true
                resetWatchdog()
                const nextStreaming = reduceStreamChunk(targetStreaming, streamEvent)
                if (nextStreaming) {
                  targetStreaming = nextStreaming
                  presenter.update(targetStreaming)
                }
              },
              (titleEvent) => {
                if (titleEvent.session_id === sessionId && titleEvent.title) {
                  store.updateSession(sessionId, { title: titleEvent.title })
                }
              },
            )
          }

        } catch (error) {
          streamError = error
        }

        if (streamError === null) break // clean exit

        const isAbort =
          isStopRequested(sessionId) ||
          (streamError instanceof DOMException && (streamError as DOMException).name === 'AbortError')

        if (isAbort || committed) throw streamError

        // TypeError = "Failed to fetch" / network drop — retryable, but only when the
        // backend never got the chance to start the turn (no chunk/runtime event was
        // observed yet). If it did, the backend has no idempotency key to tell a retry
        // apart from a brand-new turn, so resubmitting here could duplicate tool calls
        // that already ran (bash commands, file writes, external API calls). In that
        // case we fall through to surfacing a connection error instead, preserving
        // whatever partial content already streamed.
        //
        // Two ways a network drop surfaces here: `instanceof TypeError` on the
        // browser-fetch fallback path (a real TypeError, same as any web app),
        // or an explicit `.retryable` tag on the Electron path, where the
        // underlying error and its type live in the main process and don't
        // survive the IPC boundary — see makeRetryableError above.
        const isRetryableNetworkDrop =
          streamError instanceof TypeError || (streamError as RetryableError | undefined)?.retryable === true
        if (retryAttempt < MAX_RETRIES && isRetryableNetworkDrop && !receivedServerActivity) {
          retryAttempt++
          const delay = RETRY_BASE_MS * (2 ** (retryAttempt - 1)) // 1s, 2s, 4s
          store.updateMessage(sessionId, assistantMessageId, (msg) => ({
            ...msg,
            content: [{ type: 'text' as const, text: `> Connection lost. Reconnecting (attempt ${retryAttempt}/${MAX_RETRIES})…` }],
          }))
          await new Promise<void>((resolve) => setTimeout(resolve, delay))
          if (isStopRequested(sessionId)) break
          store.clearStreaming(sessionId)
          targetStreaming = []
          presenter.flush(targetStreaming)
          continue
        }

        throw streamError
      }

      if (!committed) {
        await presenter.drain()
        flushSync()
        const content = streamingToContentBlocks(useSessionStore.getState().getStreaming(sessionId))
        store.updateMessage(sessionId, assistantMessageId, (message) => ({
          ...message,
          content: content.length > 0 ? content : [{ type: 'text', text: '(empty response)' }],
        }))
        store.clearStreaming(sessionId)
      }
    } catch (error) {
      if (committed) return
      // A watchdog-triggered abort looks identical to a user Stop at the
      // AbortError level, but it isn't one - the turn stalled, not the user's
      // choice, so unlike a real Stop it must surface as a visible failure
      // (including marking the user's own message as failed to send).
      if (!watchdogTimedOut && (isStopRequested(sessionId) || (error instanceof DOMException && error.name === 'AbortError'))) {
        flushPresenter()
        const partial = streamingToContentBlocks(useSessionStore.getState().getStreaming(sessionId))
        store.updateMessage(sessionId, assistantMessageId, (message) => ({
          ...message,
          content: partial,
        }))
        store.clearStreaming(sessionId)
        return
      }
      const errMsg = watchdogTimedOut
        ? 'No response from the agent. The connection may have stalled.'
        : error instanceof Error ? error.message : 'Unable to reach the backend.'
      flushPresenter()
      const partial = streamingToContentBlocks(useSessionStore.getState().getStreaming(sessionId))
      const content = [...partial, { type: 'text' as const, text: `> ${errorHeading(errMsg)}\n\n${errMsg}` }]
      store.updateMessage(sessionId, assistantMessageId, (message) => ({ ...message, content }))
      store.updateMessage(sessionId, userMessageId, (message) => ({ ...message, status: 'error' }))
      store.clearStreaming(sessionId)
    } finally {
      if (watchdogTimer !== null) clearTimeout(watchdogTimer)
      if (syncRafRef.current !== null) {
        cancelAnimationFrame(syncRafRef.current)
        syncRafRef.current = null
      }
      presenter.cancel()
      clearSharedController(sessionId)
      clearStopRequested(sessionId)
      store.setIsStreaming(sessionId, false)
      store.updateAgentState(sessionId, { isThinking: false, activeTool: null, pendingPermission: null, stage: null })
      // Only the first turn triggers server-side title generation at all
      // (see the engine's TotalTurns==1 check) - and only once it actually
      // completed (committed), since an aborted/failed turn never reaches
      // that point server-side either.
      if (committed && isFirstMessage) {
        void pollForGeneratedTitle(sessionId)
      }
    }
  }, [sessionId])

  const stopMessage = useCallback(async () => {
    const store = useSessionStore.getState()
    if (!sessionId || !store.isSessionStreaming(sessionId)) return

    // markStopRequested/abortSharedController operate on the shared registry
    // (see chatControllers.ts), not a ref local to this hook instance — the
    // turn may have been started by a different useChat(sessionId) caller
    // (e.g. PlanEditorPanel's own hook after "Proceed"), and this needs to
    // reach that instance's in-flight fetch/EventSource, not just this one's.
    markStopRequested(sessionId)
    try {
      await api.post(`/sessions/${sessionId}/interrupt`)
    } catch {
      // Best effort — local abort below still stops the UI stream immediately.
    } finally {
      abortSharedController(sessionId)
    }
  }, [sessionId])

  return { isStreaming, sendMessage, stopMessage }
}

function openKnowledgePanel(sessionId: string, ragResults?: RAGSearchResult[]) {
  if (!ragResults || ragResults.length === 0) return
  useUIStore.getState().openRightPanel({
    kind: 'knowledge',
    title: 'Knowledge Context',
    sessionId,
    sourceLabel: `${ragResults.length} retrieved excerpt${ragResults.length > 1 ? 's' : ''}`,
    knowledgeResults: ragResults,
  })
}

function syncAssistantPlaceholder(
  sessionId: string,
  assistantMessageId: string,
  store: ReturnType<typeof useSessionStore.getState>,
) {
  const content = streamingToContentBlocks(store.getStreaming(sessionId))
  store.updateMessage(sessionId, assistantMessageId, (message) => ({
    ...message,
    content,
  }))
}
