import { useCallback } from 'react'
import { buildRightPanelId, useUIStore, type RightPanelKind } from '@renderer/stores/ui'

function rightPanelId(kind: RightPanelKind, sessionId?: string): string {
  return buildRightPanelId({ kind, sessionId })
}

// Session-scoped panel toggles (Computer / Browser / Terminal), fully
// self-contained around useUIStore - usable from the titlebar (Shell), which
// only knows the active session id from the route, not the rest of a loaded
// conversation's local state.
export function useSessionPanelToggles(sessionId?: string) {
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const computerOpen = useUIStore((s) => s.rightColumns.some((c) => c.panels.some((p) => p.kind === 'computer' && p.sessionId === sessionId)))
  const browserOpen = useUIStore((s) => s.rightColumns.some((c) => c.panels.some((p) => p.kind === 'browser' && p.sessionId === sessionId)))
  const terminalOpen = useUIStore((s) => s.rightColumns.some((c) => c.panels.some((p) => p.kind === 'terminal' && p.sessionId === sessionId)))

  const toggleComputer = useCallback(() => {
    if (computerOpen) closeRightPanel(rightPanelId('computer', sessionId))
    else openRightPanel({ kind: 'computer', title: 'Computer', sessionId })
  }, [closeRightPanel, computerOpen, openRightPanel, sessionId])

  const toggleBrowser = useCallback(() => {
    if (browserOpen) closeRightPanel(rightPanelId('browser', sessionId))
    else openRightPanel({ kind: 'browser', title: 'Browser', sessionId })
  }, [browserOpen, closeRightPanel, openRightPanel, sessionId])

  const toggleTerminal = useCallback(() => {
    if (terminalOpen) closeRightPanel(rightPanelId('terminal', sessionId))
    else openRightPanel({ kind: 'terminal', title: 'Terminal', sessionId })
  }, [terminalOpen, closeRightPanel, openRightPanel, sessionId])

  return { computerOpen, browserOpen, terminalOpen, toggleComputer, toggleBrowser, toggleTerminal }
}
