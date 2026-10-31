import { create } from 'zustand'
import type { SettingsSectionId } from '@renderer/components/settings/page/sections'

// Settings is a page (see components/settings/page). Anything can ask for one of its sections without knowing the route: it says which,
// and the host in the shell takes the person there and remembers where they came from.
type DialogsState = {
  target: SettingsSectionId | null
  openSettings: (section?: SettingsSectionId) => void
  openConfig: (section?: SettingsSectionId) => void
}

export const useDialogsStore = create<DialogsState>()((set) => ({
  target: null,
  openSettings: (section = 'general') => set({ target: section }),
  openConfig: (section = 'providers') => set({ target: section })
}))
