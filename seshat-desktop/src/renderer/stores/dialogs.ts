import { create } from 'zustand'
import type { SettingsSectionId } from '@renderer/components/settings/page/sections'

// Settings is one window over the app, opened from anywhere (the sidebar menu, the Skills page, the Plugins page...) without leaving the
// current view. Whoever opens it says which page it starts on.
type DialogsState = {
  section: SettingsSectionId | null
  openSettings: (section?: SettingsSectionId) => void
  openConfig: (section?: SettingsSectionId) => void
  close: () => void
}

export const useDialogsStore = create<DialogsState>()((set) => ({
  section: null,
  openSettings: (section = 'general') => set({ section }),
  openConfig: (section = 'providers') => set({ section }),
  close: () => set({ section: null })
}))
