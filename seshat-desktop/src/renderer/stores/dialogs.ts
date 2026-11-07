import { create } from 'zustand'
import type { SettingsSectionId } from '@renderer/components/settings/page/sections'

// Settings is one window over the app, opened from anywhere (the sidebar menu, the Skills page, the Plugins page...) without leaving the
// current view. Whoever opens it says which page it starts on.
type DialogsState = {
  section: SettingsSectionId | null
  /** The window of the Generative UI, which opens the same way. */
  generative: boolean
  openGenerative: () => void
  openSettings: (section?: SettingsSectionId) => void
  openConfig: (section?: SettingsSectionId) => void
  close: () => void
}

export const useDialogsStore = create<DialogsState>()((set) => ({
  section: null,
  generative: false,
  openGenerative: () => set({ generative: true }),
  openSettings: (section = 'account') => set({ section }),
  openConfig: (section = 'providers') => set({ section }),
  close: () => set({ section: null, generative: false })
}))
