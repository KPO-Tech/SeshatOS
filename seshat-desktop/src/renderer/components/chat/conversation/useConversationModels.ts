import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@renderer/api/client'
import type { ProviderModel, ProviderSetting } from '@renderer/api/types'
import { fetchProviderModels, useProviders } from '@renderer/hooks/useProviders'
import { useProvidersStore } from '@renderer/stores/providers'
import type { ChatSession } from '@renderer/stores/session'

export type ModelChoice = {
  id: string
  providerId: string
  providerName: string
  providerKind: string
  model: ProviderModel
}

type UseConversationModelsArgs = {
  sessionId?: string
  session?: ChatSession
  updateSession: (id: string, patch: Partial<ChatSession>) => void
  // Called when persisting the provider/model choice to the backend fails -
  // the local store is already updated optimistically (so this run keeps
  // working), but without this the choice silently reverts to whatever was
  // last saved the next time the conversation loads, with no indication why.
  onSaveError?: () => void
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

export function providerInitials(name: string, kind: string): string {
  const source = name.trim() || kind.trim() || 'AI'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export function providerDisplayName(name: string, kind: string): string {
  const displayName = name.trim()
  const providerKind = kind.trim()
  if (!displayName) return providerKind
  if (!providerKind) return displayName
  if (displayName.toLowerCase() === providerKind.toLowerCase()) return displayName
  return displayName
}

function isChatProviderUsable(provider: ProviderSetting): boolean {
  if (provider.provider === 'ollama') return true
  if (provider.auth_kind === 'oauth') return provider.connection_status === 'connected'
  return provider.has_api_key || provider.connection_status === 'ready'
}

export function useConversationModels({ sessionId, session, updateSession, onSaveError }: UseConversationModelsArgs) {
  useProviders()
  const providers = useProvidersStore((s) => s.providers)
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
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [modelRetryNonce, setModelRetryNonce] = useState(0)
  const chatProviders = useMemo(() => providers.filter(isChatProviderUsable), [providers])

  useEffect(() => {
    if (!session) return
    if (!selectedProviderId && session.providerSettingId) setSelectedProviderId(session.providerSettingId)
    if (!selectedModelId && session.modelId) setSelectedModelId(session.modelId)
  }, [session?.providerSettingId, session?.modelId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const missing = chatProviders.filter((provider) => modelsByProvider[provider.id] === undefined)
    if (missing.length === 0) return
    let cancelled = false
    setModelLoadError(null)
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
          setModelLoadError('Some model catalogs are unavailable. Check provider settings and retry.')
        })
        .finally(() => {
          if (cancelled) return
          setLoadingModelProviderIds((current) => current.filter((id) => id !== provider.id))
        })
    }
    return () => { cancelled = true }
  }, [chatProviders, modelsByProvider, modelRetryNonce])

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
  const selectedModelProviderStillLoading = Boolean(
    selectedProviderId &&
    selectedModelId &&
    modelsByProvider[selectedProviderId] === undefined
  )

  useEffect(() => {
    if (allModelChoices.length === 0) return
    if (selectedModelChoice) return
    if (selectedModelProviderStillLoading) return
    const sessionChoice = session?.providerSettingId && session?.modelId
      ? allModelChoices.find((choice) => choice.providerId === session.providerSettingId && choice.model.model_id === session.modelId)
      : null
    const def = sessionChoice
      ?? allModelChoices.find((choice) => choice.model.is_default)
      ?? allModelChoices[0]
    setSelectedProviderId(def.providerId)
    setSelectedModelId(def.model.model_id)
  }, [allModelChoices, selectedModelChoice, selectedModelProviderStillLoading, session?.providerSettingId, session?.modelId])

  const handleModelSelect = useCallback((choiceId: string) => {
    const choice = splitModelChoiceId(choiceId)
    if (!choice) return
    const provider = providers.find((p) => p.id === choice.providerId)
    const model = modelsByProvider[choice.providerId]?.find((m) => m.model_id === choice.modelId)
    setSelectedProviderId(choice.providerId)
    setSelectedModelId(choice.modelId)
    setModelLoadError(null)
    const label = model?.display_name || choice.modelId
    if (sessionId) {
      void api.patch(`/sessions/${sessionId}`, { provider_setting_id: choice.providerId, model_id: choice.modelId }).catch(() => onSaveError?.())
      updateSession(sessionId, {
        providerSettingId: choice.providerId,
        providerLabel: provider?.name,
        modelId: choice.modelId,
        modelLabel: label,
      })
    }
  }, [sessionId, providers, modelsByProvider, updateSession, onSaveError])

  const handleModelRetry = useCallback(() => {
    setModelLoadError(null)
    setModelsByProvider({})
    setModelRetryNonce((current) => current + 1)
  }, [])

  return {
    allModelChoices,
    selectedProviderId,
    selectedModelId,
    selectedModelChoice,
    selectedModelChoiceId,
    loadingModelProviderIds,
    modelLoadError,
    handleModelSelect,
    handleModelRetry,
  }
}
