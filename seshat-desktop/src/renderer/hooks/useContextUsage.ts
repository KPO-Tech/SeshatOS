import { useEffect, useState } from 'react'
import { fetchProviderModels } from '@renderer/hooks/useProviders'
import { contextUsage, streamedChars, tokensSinceReport, type ContextUsage } from '@renderer/lib/sessionOverview'
import { useSessionStore } from '@renderer/stores/session'

const STREAMED_STEP = 400

/**
 * How full the context of a session is, live while the answer streams. The window comes from the runtime's own figure once a
 * turn has reported it; before that, from the model list of the session's provider.
 */
export function useContextUsage(sessionId: string): { usage: ContextUsage | null; windowTokens: number | null } {
  const agentState = useSessionStore((s) => s.getAgentState(sessionId))
  const providerId = useSessionStore((s) => s.sessions.find((item) => item.id === sessionId)?.providerSettingId)
  const modelId = useSessionStore((s) => s.sessions.find((item) => item.id === sessionId)?.modelId)
  // A number, in steps of STREAMED_STEP characters: the gauge moves by a fraction of a percent per token, so reading the blocks themselves
  // drew it (and the composer row around it) again at every frame of the answer.
  const streamed = useSessionStore((s) => Math.floor(streamedChars(s.streamingBySession[sessionId]) / STREAMED_STEP) * STREAMED_STEP)
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
    tokensSinceReport(streamed, agentState.liveContext),
  )
  return { usage, windowTokens }
}
