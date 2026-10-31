import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ChartHistogram, Code, FileTextOne, Globe, LightMember } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { ChatInput } from '@renderer/components/chat/composer/ChatInput'
import { attachmentCategory, isPDFFile, sentAttachment, type ChatAttachment } from '@renderer/components/chat/attachments/attachmentTypes'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { api, ApiError } from '@renderer/api/client'
import type { ProviderModel } from '@renderer/api/types'
import { useProviders, fetchProviderModels } from '@renderer/hooks/useProviders'
import { useProvidersStore } from '@renderer/stores/providers'
import { useSessionStore } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { renderPDFPagePreviews } from '@renderer/lib/pdfPreview'
import { modelAlias } from '@renderer/lib/modelAlias'
import { modelSelectorOptions } from '@renderer/components/chat/conversation/modelOptions'
import { isChatProviderUsable } from '@renderer/lib/chatProviders'
import { pickDefaultChoiceWhenSettled } from '@renderer/lib/defaultModel'
import { HomeLists } from './home/HomeLists'
import { ModeCards, type HomeMode } from './home/ModeCards'
import './Home.css'

type ModelChoice = {
  id: string
  providerId: string
  providerName: string
  providerKind: string
  model: ProviderModel
}

type UploadedFileResponse = {
  id: string
  filename: string
  content_type?: string
  size?: number
  category?: 'images' | 'documents' | 'other'
  local_path?: string
}

function modelChoiceId(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`
}

function splitModelChoiceId(id: string): { providerId: string; modelId: string } | null {
  const separator = id.indexOf('::')
  if (separator <= 0 || separator === id.length - 2) return null
  return {
    providerId: id.slice(0, separator),
    modelId: id.slice(separator + 2),
  }
}

export type NewChatSuggestion = { label: string; prompt: string; icon: ReactNode }

type NewChatProps = {
  /** A folder the conversation is held in and that cannot be changed from the input: the page of a project. */
  fixedProjectPath?: string
  /** "home" is the start page, centred under a greeting; "project" is the input alone, to sit inside a page. */
  variant?: 'home' | 'project'
  placeholder?: string
  /** Buttons under the input that fill it with a first request. The start page has its own when none are given. */
  suggestions?: NewChatSuggestion[]
  autoFocus?: boolean
  /** What is shown under the buttons of the start page. */
  below?: ReactNode
}

/** The start of a conversation: the input with its model, attachments and folder, which creates the conversation and opens it. */
export function NewChat({ fixedProjectPath, variant = 'home', placeholder = 'Send a message, upload files, open a folder, or create a scheduled task...', suggestions, autoFocus, below }: NewChatProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((s) => s.providers)
  const addSession = useSessionStore((s) => s.addSession)
  const permissionMode = useUIStore((s) => s.permissionMode)
  const [inputValue, setInputValue] = useState('')
  const [mode, setMode] = useState<HomeMode>('chat')
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const providersVersion = useProvidersStore((s) => s.version)
  useEffect(() => {
    // Provider configuration changed (see refreshProviders): cached lists,
    // including ones cached as empty after a failed fetch, are stale.
    setModelsByProvider({})
  }, [providersVersion])
  const [loadingModelProviderIds, setLoadingModelProviderIds] = useState<string[]>([])
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [projectPath, setProjectPath] = useState(fixedProjectPath ?? '')
  // A session has to exist for /sessions/:id/files to accept an upload, but
  // Home never sends a message until the user hits Send. So attaching a file
  // lazily creates the session early (reused by handleSend when it fires) -
  // see ensureSessionCreated.
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const chatProviders = useMemo(() => providers.filter(isChatProviderUsable), [providers])
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null
  const selectedModels = selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []
  const selectedModel = selectedModels.find((model) => model.model_id === selectedModelId) ?? null
  const hasConfiguredProviders = chatProviders.length > 0
  // The provider a new conversation starts with, and so the model the button names while the catalogs are still on their way.
  const startingProvider = chatProviders.find((provider) => provider.is_default) ?? chatProviders[0]

  const allModelChoices = useMemo<ModelChoice[]>(() => {
    return chatProviders.flatMap((provider) => (modelsByProvider[provider.id] ?? []).map((model) => ({
      id: modelChoiceId(provider.id, model.model_id),
      providerId: provider.id,
      providerName: provider.name,
      providerKind: provider.provider,
      model,
    })))
  }, [chatProviders, modelsByProvider])

  const selectedModelChoiceId = selectedProviderId && selectedModelId
    ? modelChoiceId(selectedProviderId, selectedModelId)
    : null

  const selectedModelChoice = selectedModelChoiceId
    ? allModelChoices.find((choice) => choice.id === selectedModelChoiceId) ?? null
    : null
  const selectedProviderForSend = selectedModelChoice
    ? providers.find((provider) => provider.id === selectedModelChoice.providerId) ?? selectedProvider
    : selectedProvider
  const selectedModelForSend = selectedModelChoice?.model ?? selectedModel

  useEffect(() => {
    // On the page of a project the folder is the project's, whatever the address says.
    const project = fixedProjectPath ?? searchParams.get('project')
    if (project) setProjectPath(project)
  }, [searchParams, fixedProjectPath])

  // Auto-select default (or first) provider when none is selected and providers are loaded
  useEffect(() => {
    if (selectedProviderId || providersLoading || chatProviders.length === 0) return
    const def = chatProviders.find((p) => p.is_default) ?? chatProviders[0]
    setSelectedProviderId(def.id)
  }, [chatProviders, providersLoading, selectedProviderId])

  useEffect(() => {
    if (!selectedProviderId) return
    if (!chatProviders.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(null)
      setSelectedModelId(null)
    }
  }, [chatProviders, selectedProviderId])

  useEffect(() => {
    const missing = chatProviders.filter((provider) => modelsByProvider[provider.id] === undefined)
    if (missing.length === 0) return
    let cancelled = false
    const missingIds = missing.map((provider) => provider.id)
    setLoadingModelProviderIds((current) => Array.from(new Set([...current, ...missingIds])))

    for (const provider of missing) {
      fetchProviderModels(provider.id)
        .then((models) => {
          if (cancelled) return
          setModelsByProvider((current) => ({ ...current, [provider.id]: models }))
        })
        .catch(() => {
          if (cancelled) return
          setModelsByProvider((current) => ({ ...current, [provider.id]: [] }))
        })
        .finally(() => {
          if (cancelled) return
          setLoadingModelProviderIds((current) => current.filter((id) => id !== provider.id))
        })
    }

    return () => {
      cancelled = true
    }
  }, [chatProviders, modelsByProvider])

  // Auto-select the default model, as the in-conversation composer does: as soon as every provider that could give it has answered, and
  // not when all of them have. Waiting for all meant that one slow or unreachable provider (a local server that is off, say) left the
  // button on "Model" with nothing chosen for as long as its request lasted, though the default was known from the first answer.
  useEffect(() => {
    if (selectedModelChoice || allModelChoices.length === 0) return
    const def =
      pickDefaultChoiceWhenSettled(chatProviders, allModelChoices, (provider) => modelsByProvider[provider.id] !== undefined) ??
      (chatProviders.every((provider) => modelsByProvider[provider.id] !== undefined) ? allModelChoices[0] : null)
    if (!def) return
    setSelectedProviderId(def.providerId)
    setSelectedModelId(def.model.model_id)
  }, [allModelChoices, chatProviders, modelsByProvider, selectedModelChoice])

  useEffect(() => {
    if (!selectedModelId || allModelChoices.length === 0) return
    if (!selectedModelChoice) {
      setSelectedModelId(null)
    }
  }, [allModelChoices.length, selectedModelChoice, selectedModelId])

  function handleModelSelect(choiceId: string) {
    const choice = splitModelChoiceId(choiceId)
    if (!choice) return
    setSelectedProviderId(choice.providerId)
    setSelectedModelId(choice.modelId)
    setErrorMessage(null)
  }

  // Creates the backend session on first use and reuses it afterward, so
  // attaching a file and then sending don't create two sessions.
  async function ensureSessionCreated(): Promise<string | null> {
    if (pendingSessionId) return pendingSessionId

    if (!hasConfiguredProviders) {
      setErrorMessage('Configure a provider in Settings before starting a chat.')
      return null
    }
    // Before the catalogs have arrived, the model chosen for the default provider is the one the label names, and the one that is sent.
    const sendProvider = selectedProviderForSend ?? startingProvider
    const sendModelId = selectedModelForSend?.model_id ?? (sendProvider === startingProvider ? startingProvider?.model_id : undefined)
    if (!sendProvider) {
      setErrorMessage('Select a provider for this conversation.')
      return null
    }
    if (!sendModelId) {
      setErrorMessage('Select a model for this conversation.')
      return null
    }

    setErrorMessage(null)
    const response = await api.post<{ session_id: string }>('/sessions', {
      provider_setting_id: sendProvider.id,
      model_id: sendModelId,
      permission_mode: permissionMode,
    })
    setPendingSessionId(response.session_id)
    return response.session_id
  }

  const handleAttachFiles = async (files: FileList) => {
    if (!files.length) return
    const selectedFiles = Array.from(files)
    const pending = selectedFiles.map((file, index): ChatAttachment => ({
      id: `local-${Date.now()}-${index}-${file.name}`,
      filename: file.name,
      content_type: file.type,
      size: file.size,
      category: attachmentCategory(file),
      preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      upload_status: 'uploading',
    }))
    setAttachments((current) => [...current, ...pending])
    for (const [index, file] of selectedFiles.entries()) {
      const pendingId = pending[index]?.id
      if (isPDFFile(file)) {
        void renderPDFPagePreviews(file, 10)
          .then((previews) => {
            const urls = previews.map((preview) => preview.dataURL)
            setAttachments((current) => current.map((attachment) => (
              attachment.id === pendingId
                ? { ...attachment, preview_url: urls[0], page_preview_urls: urls }
                : attachment
            )))
          })
          .catch(() => {})
      }
    }
    await uploadAttachments(selectedFiles.map((file, index) => ({ file, id: pending[index]?.id ?? '' })))
  }

  // Files attached before a model was chosen wait here: no session can exist yet, and the person should not have to attach them again.
  const filesWaitingForModel = useRef<Array<{ file: File; id: string }>>([])

  async function uploadAttachments(items: Array<{ file: File; id: string }>) {
    setIsUploadingAttachments(true)
    setAttachmentError(null)
    try {
      const id = await ensureSessionCreated()
      if (!id) {
        filesWaitingForModel.current.push(...items)
        setAttachmentError('Select a provider and model: the files are sent as soon as you do.')
        setAttachments((current) => current.map((file) => (
          items.some((item) => item.id === file.id)
            ? { ...file, upload_status: 'failed', error: 'Select a provider and model first.' }
            : file
        )))
        return
      }
      for (const { file, id: pendingId } of items) {
        const form = new FormData()
        form.append('file', file)
        const item = await api.upload<UploadedFileResponse>(`/sessions/${id}/files`, form)
        setAttachments((current) => current.map((attachment) => (
          attachment.id === pendingId
            ? {
                ...attachment,
                id: item.id,
                filename: item.filename,
                content_type: item.content_type,
                size: item.size,
                category: item.category,
                local_path: item.local_path,
                page_preview_urls: attachment.page_preview_urls,
                preview_url: attachment.preview_url,
                upload_status: 'uploaded',
              }
            : attachment
        )))
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to attach files.'
      setAttachmentError(`Attachment upload failed: ${message}`)
      setAttachments((current) => current.map((file) => (
        items.some((item) => item.id === file.id)
          ? { ...file, upload_status: 'failed', error: message }
          : file
      )))
    } finally {
      setIsUploadingAttachments(false)
    }
  }

  useEffect(() => {
    if (!selectedProviderForSend || !selectedModelForSend || filesWaitingForModel.current.length === 0) return
    const items = filesWaitingForModel.current.splice(0)
    setAttachments((current) => current.map((file) => (
      items.some((item) => item.id === file.id) ? { ...file, upload_status: 'uploading', error: undefined } : file
    )))
    void uploadAttachments(items)
    // Only a model choice should send the waiting files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProviderForSend?.id, selectedModelForSend?.model_id])

  function handleRemoveAttachment(fileId: string) {
    filesWaitingForModel.current = filesWaitingForModel.current.filter((item) => item.id !== fileId)
    setAttachments((current) => current.filter((file) => file.id !== fileId))
    setAttachmentError(null)
    // See Conversation.tsx's handleRemoveAttachment - attachments upload
    // immediately, before any message is sent, so removing one here without
    // deleting it server-side would orphan it forever.
    if (!fileId.startsWith('local-')) {
      void api.delete(`/files/${fileId}`).catch(() => {})
    }
  }

  async function handleSend(promptOverride?: string) {
    if (attachments.some((file) => file.upload_status === 'uploading')) {
      setAttachmentError('Wait for attachments to finish uploading before sending.')
      return
    }
    const prompt = (promptOverride ?? inputValue).trim() || (attachments.length > 0 ? 'Please analyze the attached file(s).' : '')
    if (!prompt) return

    setIsCreatingSession(true)
    try {
      const wasAlreadyCreated = !!pendingSessionId
      const sessionId = await ensureSessionCreated()
      if (!sessionId || !selectedProviderForSend || !selectedModelForSend) return

      // If the session was created earlier (e.g. by attaching a file before
      // typing anything), the provider/model the user ends up sending with
      // may have changed since - sync it now rather than silently keeping
      // whatever was selected at attach time.
      if (wasAlreadyCreated) {
        await api.patch(`/sessions/${sessionId}`, {
          provider_setting_id: selectedProviderForSend.id,
          model_id: selectedModelForSend.model_id,
        }).catch(() => {})
      }

      // Persist the chosen working folder before the conversation mounts and
      // fires its first turn. Creation itself doesn't take project_path, so
      // this has to land before navigate() or the first message could run
      // against the default per-session workspace instead.
      if (projectPath) {
        await api.patch(`/sessions/${sessionId}`, { project_path: projectPath }).catch(() => {})
      }

      const fileIds = attachments
        .filter((file) => file.upload_status !== 'failed' && !file.id.startsWith('local-'))
        .map((file) => file.id)
      const sentAttachments = attachments
        .filter((file) => file.upload_status !== 'failed' && !file.id.startsWith('local-'))
        .map(sentAttachment)
      addSession({
        id: sessionId,
        title: UNTITLED_SESSION_TITLE,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        providerSettingId: selectedProviderForSend.id,
        providerLabel: selectedProviderForSend.name,
        modelId: selectedModelForSend.model_id,
        modelLabel: selectedModelForSend.display_name || selectedModelForSend.model_id,
        draftPrompt: prompt,
        draftFileIds: fileIds.length > 0 ? fileIds : undefined,
        draftAttachments: sentAttachments.length > 0 ? sentAttachments : undefined,
        projectPath: projectPath || undefined,
      })
      setInputValue('')
      setProjectPath(fixedProjectPath ?? '')
      setAttachments([])
      setAttachmentError(null)
      setPendingSessionId(null)
      navigate(`/conversation/${sessionId}`)
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : 'Unable to create the conversation.'
      )
    } finally {
      setIsCreatingSession(false)
    }
  }

  const quickActions: NewChatSuggestion[] =
    suggestions ??
    (variant === 'home'
      ? [
          { icon: <FileTextOne size={14} />, label: 'Summarize a file', prompt: 'Summarize the file at ' },
          { icon: <ChartHistogram size={14} />, label: 'Analyze data', prompt: 'Analyze the data in ' },
          { icon: <Globe size={14} />, label: 'Search the web', prompt: 'Search the web for ' },
          { icon: <LightMember size={14} />, label: 'Brainstorm ideas', prompt: 'Help me brainstorm ideas for ' },
          { icon: <Code size={14} />, label: 'Write code', prompt: 'Write code that ' }
        ]
      : [])

  function focusInput() {
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.home-input-container textarea')?.focus(), 0)
  }

  const body = (
    <>
        {variant === 'home' && (
          <>
            <SeshatLogo size={56} />
            <h1 className="home-greeting">
              Welcome to <span className="text-[var(--accent-primary)]">SeshatOS</span>
            </h1>
            <p className="home-subtitle">Your workspace for research, creation and automation with AI.</p>
            <ModeCards
              mode={mode}
              onChat={() => {
                setMode('chat')
                focusInput()
              }}
              onProject={() => navigate('/projects')}
              onTask={() => {
                setMode('task')
                setInputValue('Create a scheduled task that ')
                focusInput()
              }}
              onSkills={() => navigate('/skills')}
            />
          </>
        )}

        <div className={variant === 'home' ? 'home-input-container' : 'w-full'}>
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            placeholder={placeholder}
            maxHeight={200}
            projectPath={projectPath}
            onProjectChange={fixedProjectPath ? undefined : setProjectPath}
            projectLocked={Boolean(fixedProjectPath)}
            autoFocus={autoFocus}
            attachments={attachments}
            onAttachFiles={handleAttachFiles}
            onRemoveAttachment={handleRemoveAttachment}
            isUploadingAttachments={isUploadingAttachments}
            attachmentError={attachmentError}
            modelLabel={modelAlias(
              selectedModelChoice?.model.display_name ||
              selectedModelChoice?.model.model_id ||
              selectedModel?.display_name ||
              selectedModel?.model_id ||
              (!selectedProviderId || selectedProviderId === startingProvider?.id ? startingProvider?.model_id : undefined) ||
              'Model'
            )}
            modelIcon={
              selectedModelChoice
                ? <ProviderIcon provider={selectedModelChoice.providerKind} size={13} />
                : undefined
            }
            modelOptions={allModelChoices.length > 0 ? modelSelectorOptions(allModelChoices) : undefined}
            selectedModelId={selectedModelChoiceId}
            onModelSelect={handleModelSelect}
            modelMenuPlacement="down"
            modelDisabled={
              isCreatingSession ||
              (loadingModelProviderIds.length > 0 && allModelChoices.length === 0)
            }
          />
          {errorMessage && <div className="home-input-status error">{errorMessage}</div>}
          {!errorMessage && loadingModelProviderIds.length > 0 && allModelChoices.length === 0 && (
            <div className="home-input-status">Loading models...</div>
          )}
          {!errorMessage &&
            !providersLoading &&
            hasConfiguredProviders &&
            loadingModelProviderIds.length === 0 &&
            allModelChoices.length === 0 && (
              <div className="home-input-status">
                No model is available yet.
              </div>
            )}
          {!errorMessage && isCreatingSession && (
            <div className="home-input-status">Creating conversation...</div>
          )}
        </div>

        {quickActions.length > 0 && (
          <div className={variant === 'home' ? 'home-quick-actions' : 'home-quick-actions mt-3 justify-start'}>
            {quickActions.map((action) => (
              <QuickAction key={action.label} icon={action.icon} label={action.label} onClick={() => setInputValue(action.prompt)} />
            ))}
          </div>
        )}
        {variant === 'home' && below}
    </>
  )

  return variant === 'home' ? <div className="home-center">{body}</div> : <div className="w-full">{body}</div>
}

/** The start page: the input to begin a conversation, under a greeting. */
export function Home() {
  return (
    <div className="home-root">
      <NewChat below={<HomeLists />} />
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="qa-btn" type="button" onClick={onClick}>
      <span className="qa-icon">{icon}</span>
      <span className="qa-label">{label}</span>
    </button>
  )
}
