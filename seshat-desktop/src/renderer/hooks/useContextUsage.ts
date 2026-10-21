import { useEffect, useState } from 'react'
import { fetchProviderModels } from '@renderer/hooks/useProviders'
import { contextUsage, streamedChars, tokensSinceReport, type ContextUsage } from '@renderer/lib/sessionOverview'
import { useSessionStore } from '@renderer/stores/session'

/**
 * How full the context of a session is, live while the answer streams. The window comes from the runtime's own figure once a
 * turn has reported it; before that, from the model list of the session's provider.
 */
export function useContextUsage(sessionId: string): { usage: ContextUsage | null; windowTokens: number | null } {
  const agentState = useSessionStore((s) => s.getAgentState(sessionId))
  const providerId = useSessionStore((s) => s.sessions.find((item) => item.id === sessionId)?.providerSettingId)
  const modelId = useSessionStore((s) => s.sessions.find((item) => item.id === sessionId)?.modelId)
  const streamed = useSessionStore((s) => s.streamingBySession[sessionId])
  const [windowTokens, setWindowTokens] = useState<number | null>(null)

  useEffect(() => {
    if (!providerId || !modelId) return
    let cancelled = false
    void fetchProviderModels(providerId)
      .then((models) => {
        if (cancelled) return
        const model = models.find((item) => item.model_id === modelId)
        setWindowTokens(model?.context_window && model.context_window > 0 ? model.context_window : null)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [providerId, modelId])

  const usage = contextUsage(
    agentState.inputTokens,
    agentState.outputTokens,
    windowTokens,
    agentState.liveContext,
    tokensSinceReport(streamedChars(streamed), agentState.liveContext),
  )
  return { usage, windowTokens }
}
