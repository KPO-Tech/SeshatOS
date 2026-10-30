import { create } from 'zustand'

// The conversation the Ask view has open, for the parts of the app that are outside it (the title bar needs it to offer the panels of the
// conversation). Set by the view while it is mounted, never kept.
type AskSessionState = {
  sessionId: string | null
  setSessionId: (sessionId: string | null) => void
}

export const useAskSessionStore = create<AskSessionState>()((set) => ({
  sessionId: null,
  setSessionId: (sessionId) => set({ sessionId })
}))
