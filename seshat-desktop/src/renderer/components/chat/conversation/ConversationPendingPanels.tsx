import type { PlanDocument, ToolUseBlock } from '@renderer/api/types'
import { AskUserPanel } from '@renderer/components/chat/panels/AskUserPanel'
import { PlanArtifactCard } from '@renderer/components/chat/messages/PlanArtifactCard'

type ConversationPendingPanelsProps = {
  sessionId?: string
  pendingPlan?: PlanDocument
  pendingAskUser: ToolUseBlock | null
  onPlanProceed: (planId: string) => void | Promise<void>
  onPlanReject: (planId: string) => void | Promise<void>
  onSubmitToolPrompt: (promptId: string, value: unknown) => void
}

export function ConversationPendingPanels({
  sessionId,
  pendingPlan,
  pendingAskUser,
  onPlanProceed,
  onPlanReject,
  onSubmitToolPrompt,
}: ConversationPendingPanelsProps) {
  return (
    <>
      {sessionId && pendingPlan && (
        <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'center' }}>
          <PlanArtifactCard plan={pendingPlan} sessionId={sessionId} onProceed={onPlanProceed} onReject={onPlanReject} />
        </div>
      )}

      {pendingAskUser && pendingAskUser._prompt && (
        <AskUserPanel tool={pendingAskUser} onSubmitPrompt={onSubmitToolPrompt} />
      )}
    </>
  )
}
