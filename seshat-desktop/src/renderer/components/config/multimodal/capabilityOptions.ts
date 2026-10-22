import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'

export type CapabilityOptionCapability = 'image' | 'audio'
export type CapabilityOptionValues = Record<string, string>

// An image provider the engine knows and its models, the default first.
export type ImageProviderCatalogEntry = { id: string; display_name: string; models: string[] }

// The choices saved for one capability besides its provider (image model, voice, format...), and the way to save them.
export function useCapabilityOptions(capability: CapabilityOptionCapability) {
  const [saved, setSaved] = useState<CapabilityOptionValues>({})
  const [imageProviders, setImageProviders] = useState<ImageProviderCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ options: Record<string, CapabilityOptionValues>; catalog?: { image?: ImageProviderCatalogEntry[] } }>('/settings/capability-options')
      setSaved(data.options?.[capability] ?? {})
      setImageProviders(data.catalog?.image ?? [])
    } catch {
      setSaved({})
    } finally {
      setLoading(false)
    }
  }, [capability])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(
    async (options: CapabilityOptionValues) => {
      const data = await api.put<{ options: CapabilityOptionValues }>(`/settings/capability-options/${capability}`, { options })
      setSaved(data.options ?? {})
    },
    [capability]
  )

  return { saved, loading, save, imageProviders }
}
