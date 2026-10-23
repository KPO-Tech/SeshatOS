import { useEffect, useMemo, useState } from 'react'
import type { ProviderModel, ProviderSetting } from '@renderer/api/types'
import { fetchProviderModels, useProviders } from '@renderer/hooks/useProviders'
import { isChatProviderUsable } from '@renderer/lib/chatProviders'
import { useProvidersStore } from '@renderer/stores/providers'

export type DefaultModel = { provider: ProviderSetting; model: ProviderModel }

// The model a new Knowledge conversation starts with: the default model of the default provider, as the chat home picks it. Null while
// the providers load, and when none can answer.
export function useDefaultModel(): { choice: DefaultModel | null; loading: boolean; configured: boolean } {
  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((state) => state.providers)
  const usable = useMemo(() => providers.filter(isChatProviderUsable), [providers])
  const [models, setModels] = useState<Record<string, ProviderModel[]>>({})

  useEffect(() => {
    const missing = usable.filter((provider) => models[provider.id] === undefined)
    if (missing.length === 0) return
    let cancelled = false
    for (const provider of missing) {
      fetchProviderModels(provider.id)
        .then((list) => !cancelled && setModels((current) => ({ ...current, [provider.id]: list })))
        .catch(() => !cancelled && setModels((current) => ({ ...current, [provider.id]: [] })))
    }
    return () => {
      cancelled = true
    }
  }, [usable, models])

  const loaded = usable.length > 0 && usable.every((provider) => models[provider.id] !== undefined)
  const choice = useMemo<DefaultModel | null>(() => {
    if (!loaded) return null
    const ordered = [...usable].sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)))
    for (const provider of ordered) {
      const list = models[provider.id] ?? []
      const model = list.find((item) => item.is_default) ?? list[0]
      if (model) return { provider, model }
    }
    return null
  }, [loaded, usable, models])

  return { choice, loading: providersLoading || (usable.length > 0 && !loaded), configured: usable.length > 0 }
}
