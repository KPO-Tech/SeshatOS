import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProviderSetting } from '@renderer/api/types'

type ProvidersState = {
  providers: ProviderSetting[]
  loading: boolean
  selectedModelId: string | null
  // Bumped whenever the provider configuration changes (see refreshProviders)
  // so anything caching per-provider model lists can discard them. Not
  // persisted: it only has to differ within one run.
  version: number

  setProviders: (providers: ProviderSetting[]) => void
  setLoading: (v: boolean) => void
  bumpVersion: () => void
  selectModel: (modelId: string | null) => void
  updateProvider: (id: string, data: Partial<ProviderSetting>) => void
  removeProvider: (id: string) => void
  setDefault: (id: string) => void
}

export const useProvidersStore = create<ProvidersState>()(
  persist(
    (set) => ({
      providers: [],
      loading: false,
      selectedModelId: null,
      version: 0,

      setProviders: (providers) => set({ providers }),
      setLoading: (v) => set({ loading: v }),
      bumpVersion: () => set((s) => ({ version: s.version + 1 })),
      selectModel: (modelId) => set({ selectedModelId: modelId }),

      updateProvider: (id, data) =>
        set((s) => ({
          providers: s.providers.map((p) => (p.id === id ? { ...p, ...data } : p)),
        })),

      removeProvider: (id) =>
        set((s) => ({
          providers: s.providers.filter((p) => p.id !== id),
        })),

      setDefault: (id) =>
        set((s) => ({
          providers: s.providers.map((p) => ({ ...p, is_default: p.id === id })),
        })),
    }),
    { name: 'nexus-providers', partialize: (s) => ({ selectedModelId: s.selectedModelId }) }
  )
)
