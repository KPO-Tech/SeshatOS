import { create } from 'zustand'

type Pending = { message: string; resolve: (confirmed: boolean) => void }

type ConfirmState = {
  pending: Pending | null
  answer: (confirmed: boolean) => void
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  pending: null,
  answer: (confirmed) => {
    const pending = get().pending
    set({ pending: null })
    pending?.resolve(confirmed)
  },
}))

/**
 * Asks the person to confirm an action, in the app's own dialog (ConfirmActionHost). It replaces window.confirm: the native box looks
 * foreign, and on Windows Electron leaves the text fields unable to take focus after it closes. A question asked while another waits
 * answers the first one "no".
 */
export function confirmAction(message: string): Promise<boolean> {
  useConfirmStore.getState().pending?.resolve(false)
  return new Promise((resolve) => useConfirmStore.setState({ pending: { message, resolve } }))
}
