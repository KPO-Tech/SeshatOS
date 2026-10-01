import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { ChatInput } from './ChatInput'
import type { ChatAttachment } from '@renderer/components/chat/attachments/attachmentTypes'
import { providerDisplayName, providerInitials, type ModelChoice } from '@renderer/components/chat/conversation/useConversationModels'
import { modelAlias } from '@renderer/lib/modelAlias'

type SendMessageOptions = {
  corpusId?: string | null
  fileIds?: string[]
  attachments?: ChatAttachment[]
  agentSlug?: string
  providerSettingId?: string | null
  modelId?: string | null
}

type ConversationComposerProps = {
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
  hasProcessingDocuments: boolean
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
  hasProcessingDocuments,
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
            if (hasProcessingDocuments) {
              setAttachmentError('Wait for document reading to finish before sending.')
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
          placeholder="Message SeshatOS..."
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
            modelLoadError
              ? 'Models unavailable'
              : modelAlias(selectedModelChoice?.model.display_name || selectedModelChoice?.model.model_id || sessionModelLabel || 'Model')
          }
          modelIcon={
            selectedModelChoice
              ? <ProviderIcon provider={selectedModelChoice.providerKind} size={13} />
              : undefined
          }
          modelOptions={!modelLoadError ? allModelChoices.map((choice) => ({
            id: choice.id,
            label: modelAlias(choice.model.display_name || choice.model.model_id),
            description: providerDisplayName(choice.providerName, choice.providerKind),
            icon: <ProviderIcon provider={choice.providerKind} size={17} />,
            prefix: providerInitials(choice.providerName, choice.providerKind),
          })) : undefined}
          selectedModelId={selectedModelChoiceId}
          onModelSelect={handleModelSelect}
          modelDisabled={loadingModelProviderIds.length > 0 && allModelChoices.length === 0}
          modelError={modelLoadError}
          onModelRetry={handleModelRetry}
          executionMode={executionMode}
          onExecutionModeChange={onExecutionModeChange}
        />
      </div>
    </div>
  )
}
