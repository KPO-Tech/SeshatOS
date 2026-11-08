import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { ChatInput } from './ChatInput'
import { ComposerStatusRow } from './ComposerStatusRow'
import type { ChatAttachment } from '@renderer/components/chat/attachments/attachmentTypes'
import type { ModelChoice } from '@renderer/components/chat/conversation/useConversationModels'
import { modelSelectorOptions } from '@renderer/components/chat/conversation/modelOptions'
import { modelAlias } from '@renderer/lib/modelAlias'
import { useTranslation } from 'react-i18next'
import { CheckOne } from '@icon-park/react'
import { useUIStore } from '@renderer/stores/ui'

type SendMessageOptions = {
  corpusId?: string | null
  fileIds?: string[]
  attachments?: ChatAttachment[]
  agentSlug?: string
  providerSettingId?: string | null
  modelId?: string | null
}

type ConversationComposerProps = {
  sessionId?: string
  inputValue: string
  setInputValue: (value: string) => void
  selectedCorpusId: string | null
  setSelectedCorpusId: (id: string | null) => void
  projectPath?: string
  onProjectChange: (path: string) => void
  attachments: ChatAttachment[]
  onAttachFiles: (files: FileList) => void | Promise<void>
  onRemoveAttachment: (id: string) => void
  uploadingAttachments: boolean
  attachmentError: string | null
  setAttachmentError: (error: string | null) => void
  hasUploadingAttachments: boolean
  clearAttachments: () => void
  uploadedFileIds: string[]
  sentAttachments: ChatAttachment[]
  sendMessage: (prompt: string, options?: SendMessageOptions) => void | Promise<unknown>
  stopMessage: () => void | Promise<unknown>
  isStreaming: boolean
  selectedProviderId: string | null
  selectedModelId: string | null
  sessionModelLabel?: string
  selectedModelChoice: ModelChoice | null
  selectedModelChoiceId: string | null
  allModelChoices: ModelChoice[]
  loadingModelProviderIds: string[]
  modelLoadError: string | null
  handleModelSelect: (choiceId: string) => void
  handleModelRetry: () => void
  executionMode?: 'execute' | 'plan' | 'pair_programming'
  onExecutionModeChange?: (mode: 'execute' | 'plan') => void
}

export function ConversationComposer({
  sessionId,
  inputValue,
  setInputValue,
  selectedCorpusId,
  setSelectedCorpusId,
  projectPath,
  onProjectChange,
  attachments,
  onAttachFiles,
  onRemoveAttachment,
  uploadingAttachments,
  attachmentError,
  setAttachmentError,
  hasUploadingAttachments,
  clearAttachments,
  uploadedFileIds,
  sentAttachments,
  sendMessage,
  stopMessage,
  isStreaming,
  selectedProviderId,
  selectedModelId,
  sessionModelLabel,
  selectedModelChoice,
  selectedModelChoiceId,
  allModelChoices,
  loadingModelProviderIds,
  modelLoadError,
  handleModelSelect,
  handleModelRetry,
  executionMode,
  onExecutionModeChange,
}: ConversationComposerProps) {
  const { t } = useTranslation('chat')
  const condenseTurns = useUIStore((state) => state.condenseTurns)
  const setCondenseTurns = useUIStore((state) => state.setCondenseTurns)
  return (
    <div className="conv-input-area">
      <div className="conv-input-inner">
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={() => {
            if (hasUploadingAttachments) {
              setAttachmentError('Wait for attachments to finish uploading before sending.')
              return
            }
            const prompt = inputValue.trim() || (attachments.length > 0 ? 'Please analyze the attached file(s).' : '')
            if (!prompt) return
            setInputValue('')
            clearAttachments()
            void sendMessage(prompt, {
              corpusId: selectedCorpusId,
              fileIds: uploadedFileIds,
              attachments: sentAttachments,
              providerSettingId: selectedProviderId,
              modelId: selectedModelId,
            })
          }}
          onStop={() => { void stopMessage() }}
          placeholder={t('chat.composer.conversationComposer.messageSeshatos')}
          isStreaming={isStreaming}
          showInlineStatus={false}
          selectedCorpusId={selectedCorpusId}
          onCorpusChange={setSelectedCorpusId}
          projectPath={projectPath}
          onProjectChange={onProjectChange}
          attachments={attachments}
          onAttachFiles={onAttachFiles}
          onRemoveAttachment={onRemoveAttachment}
          isUploadingAttachments={uploadingAttachments}
          attachmentError={attachmentError}
          modelLabel={
            // A load failure on one provider must not blank out a model
            // that's actually selected and available from another provider
            // that succeeded - only claim "unavailable" when there's
            // genuinely nothing to choose from.
            allModelChoices.length === 0 && modelLoadError
              ? t('chat.composer.conversationComposer.modelsUnavailable')
              : modelAlias(selectedModelChoice?.model.display_name || selectedModelChoice?.model.model_id || sessionModelLabel || 'Model')
          }
          modelIcon={
            selectedModelChoice
              ? <ProviderIcon provider={selectedModelChoice.providerKind} size={13} />
              : undefined
          }
          modelOptions={allModelChoices.length > 0 ? modelSelectorOptions(allModelChoices) : undefined}
          selectedModelId={selectedModelChoiceId}
          onModelSelect={handleModelSelect}
          modelDisabled={loadingModelProviderIds.length > 0 && allModelChoices.length === 0}
          modelError={modelLoadError}
          onModelRetry={handleModelRetry}
          executionMode={executionMode}
          onExecutionModeChange={onExecutionModeChange}
        />
        {sessionId && <ComposerStatusRow sessionId={sessionId} projectPath={projectPath} />}
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border-0 bg-transparent px-1 py-0.5 text-[11px] text-app-text-muted transition-colors hover:text-app-text-secondary"
            aria-pressed={condenseTurns}
            onClick={() => setCondenseTurns(!condenseTurns)}
          >
            <span className={`inline-flex size-3 items-center justify-center rounded-[3px] border ${condenseTurns ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'border-[var(--border-strong)]'}`}>
              {condenseTurns && <CheckOne size={8} />}
            </span>
            {t('chat.composer.conversationComposer.condenseTurns')}
          </button>
        </div>
      </div>
    </div>
  )
}
