import { create } from 'zustand'

// Whether any centered modal (Search, Settings, Config) is currently
// covering the app. The native browser view can't be dimmed/blurred by a
// modal's own CSS backdrop - it's a separate OS-composited surface - so
// BrowserLiveView watches this to freeze itself to a blurred still image
// while a modal sits on top, instead of staying bright underneath it.
type OverlayState = {
  modalOpen: boolean
  setModalOpen: (open: boolean) => void
}

export const useOverlayStore = create<OverlayState>()((set) => ({
  modalOpen: false,
  setModalOpen: (open) => set({ modalOpen: open })
}))
