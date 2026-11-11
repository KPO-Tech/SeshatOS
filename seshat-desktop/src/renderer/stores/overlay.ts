import { create } from 'zustand'

// Whether a centered modal (Search, Settings, Config) covers the app. The browser panel's page is a native view drawn above the interface,
// which a modal's backdrop cannot cover: the panel takes it off while a modal is open (see useCoveredByDialog.ts, which also watches every
// role="dialog" in the page).
type OverlayState = {
  modalOpen: boolean
  setModalOpen: (open: boolean) => void
}

export const useOverlayStore = create<OverlayState>()((set) => ({
  modalOpen: false,
  setModalOpen: (open) => set({ modalOpen: open })
}))
