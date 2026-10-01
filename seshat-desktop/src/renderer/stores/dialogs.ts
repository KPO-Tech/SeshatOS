import { create } from 'zustand'
import type { ConfigSection } from '@renderer/components/config/ConfigModal'
import type { SettingsSection } from '@renderer/components/settings/SettingsModal'

// Settings and Config are centered modals, opened from anywhere (sidebar menu,
// Skills page, Plugins page...) without navigating away from the current view.
type DialogsState = {
  settingsSection: SettingsSection | null
  configSection: ConfigSection | null
  openSettings: (section?: SettingsSection) => void
  openConfig: (section?: ConfigSection) => void
  closeTopmost: () => boolean
  closeAll: () => void
}

export const useDialogsStore = create<DialogsState>()((set, get) => ({
  settingsSection: null,
  configSection: null,
  openSettings: (section = 'general') => set({ settingsSection: section }),
  openConfig: (section = 'providers') => set({ configSection: section }),
  // Returns whether something was closed, so Escape can fall through to other handlers.
  closeTopmost: () => {
    const { settingsSection, configSection } = get()
    if (settingsSection) {
      set({ settingsSection: null })
      return true
    }
    if (configSection) {
      set({ configSection: null })
      return true
    }
    return false
  },
  closeAll: () => set({ settingsSection: null, configSection: null })
}))
