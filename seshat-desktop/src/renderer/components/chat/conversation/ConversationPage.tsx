import { useState } from 'react'
import { useParams } from 'react-router'
import { useSessionStore, EMPTY_STREAMING, DEFAULT_AGENT_STATE } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import { isRenderableMessage } from '../messages/MessageItem'
import { ConversationComposer } from '../composer/ConversationComposer'
import { useDraftAttachments } from '../composer/useDraftAttachments'
import { useConversationModes } from './useConversationModes'
import { useConversationPanels } from './useConversationPanels'
import { ConversationPendingPanels } from './ConversationPendingPanels'
import { useConversationRuntimeActions } from './useConversationRuntimeActions'
import { useConversationScroll } from './useConversationScroll'
import { useConversationSessionLoad } from './useConversationSessionLoad'
import { useConversationModels } from './useConversationModels'
import { ConversationEmpty } from './ConversationEmpty'
import { useLiveActivityForAgent } from '../messages/liveActivity'
import { MessageList } from '../messages/MessageList'
import { useToast, ToastStack } from '@renderer/components/ui/Toast'
import { useChat } from '@renderer/hooks/useChat'
import './ConversationPage.css'

export function ConversationPage() {
  const { id } = useParams()
  const sessions = useSessionStore((s) => s.sessions)
  const updateSession = useSessionStore((s) => s.updateSession)
  const streaming = useSessionStore((s) => (id ? s.streamingBySession[id] : null) ?? EMPTY_STREAMING)
  const session = sessions.find((s) => s.id === id)
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const computerOpen = useUIStore((s) =>
    s.rightColumns.some((c) => c.panels.some((p) => p.kind === 'computer' && p.sessionId === id))
  )
  const filesOpen = useUIStore((s) =>
    s.rightColumns.some((c) => c.panels.some((p) => p.kind === 'files' && p.sessionId === id))
  )
  const { toasts, show: showToast } = useToast()

  const {
    allModelChoices,
    selectedProviderId,
    selectedModelId,
    selectedModelChoice,
    selectedModelChoiceId,
    loadingModelProviderIds,
    modelLoadError,
    handleModelSelect,
    handleModelRetry,
  } = useConversationModels({
    sessionId: id,
    session,
    updateSession,
    onSaveError: () => showToast("Couldn't save model selection - it may revert next time you open this conversation.", 'err'),
  })

  const {
    handleExecutionModeSelect,
    handleProjectChange,
  } = useConversationModes({
    sessionId: id,
    updateSession,
  })

  const agentState = useSessionStore((s) => (id ? s.agentStates[id] : null) ?? DEFAULT_AGENT_STATE)
  const pendingPermission = agentState.pendingPermission
  const isPlanPending = pendingPermission?.toolName === 'exit_plan_mode'
  const pendingPlan = useSessionStore((s) => (id ? s.getPendingPlan(id) : undefined))
  const pendingAskUser = streaming.find(
    (b) => b.type === 'tool_use' && b.name === 'ask_user_question' && b._prompt
  ) ?? null
  const liveActivity = useLiveActivityForAgent(agentState)
  const [inputValue, setInputValue] = useState('')
  const [selectedCorpusId, setSelectedCorpusId] = useState<string | null>(null)
  const {
    attachments,
    uploadingAttachments,
    attachmentError,
    setAttachmentError,
    clearAttachments,
    handleAttachFiles,
    handleRemoveAttachment,
    hasUploadingAttachments,
    hasProcessingDocuments,
    uploadedFileIds,
    sentAttachments,
  } = useDraftAttachments(id)
  // Brief "done" checkmark after a genuinely successful turn - fires only
  // from useChat's actual commit path (see onTurnSuccess below), never on
  // isStreaming's falling edge alone, since that also fires on failure and
  // would otherwise flash a success checkmark on an errored turn.
  const [justCompleted, setJustCompleted] = useState(false)
  const { sendMessage, stopMessage, isStreaming } = useChat(id || '', {
    onCompaction: (preTokens, postTokens) => {
      const saved = preTokens - postTokens
      showToast(`Compacted conversation - saved ${saved.toLocaleString()} tokens (${preTokens.toLocaleString()} → ${postTokens.toLocaleString()})`, 'info')
    },
    onTurnSuccess: () => {
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 1500)
    },
  })

  useConversationPanels({
    sessionId: id,
    agentState,
    streaming,
    computerOpen,
    filesOpen,
    isPlanPending,
    pendingPlan,
    openRightPanel,
  })

  useConversationSessionLoad({
    sessionId: id,
    session,
    updateSession,
    sendMessage,
    setInputValue,
  })

  // session can go away mid-render (e.g. deleting the currently-open
  // conversation re-renders this component before navigate('/') takes
  // effect) - every hook below must still run the same way regardless, so
  // the "session not found" return sits after all of them, not before.
  const visibleMessages = session ? session.messages.filter((message, index) => (
    isRenderableMessage(message) ||
    (isStreaming && !pendingPermission && !pendingAskUser && message.role === 'assistant' && index === session.messages.length - 1)
  )) : []

  const {
    handlePlanProceed,
    handlePlanDeny,
    onApproveTool,
    onDenyTool,
    onSubmitToolPrompt,
  } = useConversationRuntimeActions({
    sessionId: id,
    pendingPermission,
    sendMessage,
    onBlocked: (message) => showToast(message, 'err'),
  })

  // Virtual list - renders only the rows visible in the viewport.
  const { scrollRef, rowVirtualizer } = useConversationScroll({
    messageCount: visibleMessages.length,
    streaming,
  })

  if (!session) {
    return <ConversationEmpty />
  }

  return (
    <div className="conv-root">
      <ToastStack toasts={toasts} />

      <MessageList
        sessionId={id}
        messages={visibleMessages}
        scrollRef={scrollRef}
        rowVirtualizer={rowVirtualizer}
        blurred={isPlanPending}
        isStreaming={isStreaming}
        pendingPermission={pendingPermission}
        pendingAskUser={pendingAskUser}
        liveActivity={liveActivity}
        justCompleted={justCompleted}
        onApproveTool={onApproveTool}
        onDenyTool={onDenyTool}
        onSubmitToolPrompt={onSubmitToolPrompt}
        onRetryMessage={(text, attachments) => {
          void sendMessage(text, attachments?.length ? { fileIds: attachments.map((a) => a.id), attachments } : undefined)
        }}
      />

      <ConversationPendingPanels
        sessionId={id}
        pendingPlan={pendingPlan}
        pendingAskUser={pendingAskUser?.type === 'tool_use' ? pendingAskUser : null}
        onPlanProceed={handlePlanProceed}
        onPlanReject={handlePlanDeny}
        onSubmitToolPrompt={onSubmitToolPrompt}
      />

      <ConversationComposer
        inputValue={inputValue}
        setInputValue={setInputValue}
        selectedCorpusId={selectedCorpusId}
        setSelectedCorpusId={setSelectedCorpusId}
        projectPath={session.projectPath}
        onProjectChange={handleProjectChange}
        attachments={attachments}
        onAttachFiles={handleAttachFiles}
        onRemoveAttachment={handleRemoveAttachment}
        uploadingAttachments={uploadingAttachments}
        attachmentError={attachmentError}
        setAttachmentError={setAttachmentError}
        hasUploadingAttachments={hasUploadingAttachments}
        hasProcessingDocuments={hasProcessingDocuments}
        clearAttachments={clearAttachments}
        uploadedFileIds={uploadedFileIds}
        sentAttachments={sentAttachments}
        sendMessage={sendMessage}
        stopMessage={stopMessage}
        isStreaming={isStreaming}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        sessionModelLabel={session.modelLabel}
        selectedModelChoice={selectedModelChoice}
        selectedModelChoiceId={selectedModelChoiceId}
        allModelChoices={allModelChoices}
        loadingModelProviderIds={loadingModelProviderIds}
        modelLoadError={modelLoadError}
        handleModelSelect={handleModelSelect}
        handleModelRetry={handleModelRetry}
        executionMode={agentState.executionMode}
        onExecutionModeChange={handleExecutionModeSelect}
      />
    </div>
  )
}

