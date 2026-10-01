import { useCallback } from 'react'
import { api } from '@renderer/api/client'
import type { PlanDocument } from '@renderer/api/types'
import { streamingToContentBlocks, useSessionStore, type PendingPermission } from '@renderer/stores/session'

type SendMessage = (prompt: string) => void | Promise<unknown>

type UseConversationRuntimeActionsArgs = {
  sessionId?: string
  pendingPermission: PendingPermission | null
  sendMessage: SendMessage
  // Surfaces a message when an action couldn't be completed (e.g. a toast) -
  // used by handlePlanProceed, which can be blocked or fail server-side with
  // no other UI to report through (the plan card itself has no error slot).
  onBlocked?: (message: string) => void
}

export function useConversationRuntimeActions({
  sessionId,
  pendingPermission,
  sendMessage,
  onBlocked,
}: UseConversationRuntimeActionsArgs) {
  const handlePermissionDecision = useCallback(async (toolUseId: string, approved: boolean, remember = false) => {
    if (!sessionId) return
    const current = useSessionStore.getState()
    const nextStreaming = current.getStreaming(sessionId).map((block) => {
      if (block.type !== 'tool_use' || block.id !== toolUseId) return block
      return {
        ...block,
        _status: approved ? ('running' as const) : ('failed' as const),
        _approval: undefined,
      }
    })
    current.setStreaming(sessionId, nextStreaming)
    const lastAssistant = [...(current.sessions.find((item) => item.id === sessionId)?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (lastAssistant?.id) {
      current.updateMessage(sessionId, lastAssistant.id, (message) => ({
        ...message,
        content: streamingToContentBlocks(nextStreaming),
      }))
    }
    current.updateAgentState(sessionId, { pendingPermission: null })
    try {
      await api.post(`/permissions/${toolUseId}`, { approved, remember, session_id: sessionId })
    } catch {
      // The stream handler will surface the terminal error if the approval bridge is gone.
    }
  }, [sessionId])

  const handlePlanProceed = useCallback(async (planId: string) => {
    if (!sessionId) return
    const store = useSessionStore.getState()
    const plan = store.getPlan(sessionId, planId)

    if (pendingPermission?.toolName === 'exit_plan_mode') {
      // Legacy path: the permission approval call below carries plan_id and
      // syncs plan_documents.status itself (see PlanEditorPanel.handleProceed's
      // comment) - this PATCH is just a best-effort local-state refresh, not
      // the real unblock mechanism, so a failure here is safe to ignore.
      if (plan && plan.status === 'pending') {
        try {
          const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'validated' })
          store.upsertPlan(sessionId, updated)
        } catch { /* best-effort - the permission approval below still unblocks the model */ }
      }
      await handlePermissionDecision(pendingPermission.toolUseId, true)
      return
    }

    // submit_plan doesn't block the turn (RequiresPermission: false) - by the
    // time the plan reaches review, the model's turn has already ended and
    // nothing is listening on a permission channel. The PATCH below is the
    // only server-side record of approval, and sendMessage is the only way
    // to notify the model - unlike the legacy branch above, neither can be
    // skipped or have its failure swallowed (see PlanEditorPanel.handleProceed
    // for the same reasoning, including the streaming guard before the PATCH).
    if (store.isSessionStreaming(sessionId)) {
      onBlocked?.('The agent is still running another turn on this session — wait for it to finish, then try again.')
      return
    }
    if (plan && plan.status === 'pending') {
      try {
        const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'validated' })
        store.upsertPlan(sessionId, updated)
      } catch (err) {
        onBlocked?.(`Couldn't approve the plan: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was sent — try again.`)
        return
      }
    }
    await sendMessage('The plan has been approved. Proceed with implementation: call exit_plan_mode, then execute the plan.')
  }, [handlePermissionDecision, onBlocked, pendingPermission, sendMessage, sessionId])

  // Rejects a plan straight from its inline card (PlanArtifactCard), with no
  // way to attach feedback - that's only available in the full PlanEditorPanel.
  // Mirrors handlePlanProceed's two branches and guards, just for rejection.
  const handlePlanDeny = useCallback(async (planId: string) => {
    if (!sessionId) return
    const store = useSessionStore.getState()
    const plan = store.getPlan(sessionId, planId)

    if (pendingPermission?.toolName === 'exit_plan_mode') {
      await handlePermissionDecision(pendingPermission.toolUseId, false)
      if (plan && plan.status === 'pending') {
        try {
          const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'rejected' })
          store.upsertPlan(sessionId, updated)
        } catch { /* best-effort - the permission denial above already unblocked the model */ }
      }
      return
    }

    if (store.isSessionStreaming(sessionId)) {
      onBlocked?.('The agent is still running another turn on this session — wait for it to finish, then try again.')
      return
    }
    if (plan && plan.status === 'pending') {
      try {
        const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'rejected' })
        store.upsertPlan(sessionId, updated)
      } catch (err) {
        onBlocked?.(`Couldn't reject the plan: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was sent — try again.`)
        return
      }
    }
    await sendMessage("I'd like changes before approving this plan. Please revise and resubmit it with submit_plan.")
  }, [handlePermissionDecision, onBlocked, pendingPermission, sendMessage, sessionId])

  const handlePromptSubmission = useCallback(async (promptId: string, value: unknown) => {
    if (!sessionId) return
    const current = useSessionStore.getState()
    const nextStreaming = current.getStreaming(sessionId).map((block) => {
      if (block.type !== 'tool_use' || block.name !== 'ask_user_question' || block._prompt?.promptId !== promptId) {
        return block
      }
      return {
        ...block,
        _prompt: undefined,
        _message: 'Waiting for the tool result...',
      }
    })
    current.setStreaming(sessionId, nextStreaming)
    const lastAssistant = [...(current.sessions.find((item) => item.id === sessionId)?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (lastAssistant?.id) {
      current.updateMessage(sessionId, lastAssistant.id, (message) => ({
        ...message,
        content: streamingToContentBlocks(nextStreaming),
      }))
    }
    try {
      await api.post(`/prompts/${promptId}`, { value, session_id: sessionId })
    } catch {
      // The stream will surface the terminal error if the bridge is gone.
    }
  }, [sessionId])

  const onApproveTool = useCallback((toolUseId: string, remember?: boolean) => {
    void handlePermissionDecision(toolUseId, true, remember)
  }, [handlePermissionDecision])

  const onDenyTool = useCallback((toolUseId: string) => {
    void handlePermissionDecision(toolUseId, false)
  }, [handlePermissionDecision])

  const onSubmitToolPrompt = useCallback((promptId: string, value: unknown) => {
    void handlePromptSubmission(promptId, value)
  }, [handlePromptSubmission])

  return {
    handlePlanProceed,
    handlePlanDeny,
    onApproveTool,
    onDenyTool,
    onSubmitToolPrompt,
  }
}
