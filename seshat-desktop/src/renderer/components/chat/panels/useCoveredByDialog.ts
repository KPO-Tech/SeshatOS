import { useEffect, useState } from 'react'
import { useOverlayStore } from '@renderer/stores/overlay'

const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"]'

function dialogOnScreen(): boolean {
  return document.querySelector(DIALOG_SELECTOR) !== null
}

/**
 * Whether a dialog is open over the app. The browser panel's page is a native view drawn above the whole interface: a dialog, a search or
 * the notifications under it would be hidden, so the panel takes its view off while one is open. Every dialog of the app carries
 * role="dialog" (or aria-modal), which is watched in the page, and the modals that report themselves (overlay store) count too.
 */
export function useCoveredByDialog(): boolean {
  const modalOpen = useOverlayStore((state) => state.modalOpen)
  const [dialog, setDialog] = useState(dialogOnScreen)

  useEffect(() => {
    let frame: number | null = null
    const check = () => {
      frame = null
      setDialog(dialogOnScreen())
    }
    // The chat changes the page many times a second while it streams: one check per frame at most.
    const observer = new MutationObserver(() => {
      if (frame === null) frame = window.requestAnimationFrame(check)
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal'] })
    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [])

  return modalOpen || dialog
}
