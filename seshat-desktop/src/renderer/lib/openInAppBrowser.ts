import type { MouseEvent } from 'react'

// Routes an http(s) link click to the app's own embedded browser panel
// (main/ipc/browser-panel.ts's WebContentsView) instead of the OS's default
// browser. Used by chat message markdown links - a plain <a href> otherwise
// causes an Electron same-frame top-level navigation, replacing the whole
// app UI with the linked page instead of opening it anywhere sensible.
//
// sessionId scopes the browser tab/history to the conversation the link was
// clicked from (browser-panel.ts's own `session:<id>` context convention),
// so links clicked in different conversations don't share a tab. Falls back
// to a normal external tab when the Electron bridge isn't available (web
// build/dev mode without window.nexus).
export function openInAppBrowser(url: string, sessionId?: string): void {
  if (typeof window === 'undefined' || !window.nexus?.browser) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  void window.nexus.browser.openUrl(url, sessionId).catch(() => {
    window.open(url, '_blank', 'noopener,noreferrer')
  })
}

// Only intercept plain left-clicks for plain http(s) links - never hijack a
// modifier-clicked link (new tab/window/download intent) or a non-web
// scheme (mailto:, file:, etc.), which should keep their native behavior.
export function shouldOpenInAppBrowser(event: MouseEvent, href: string | undefined): href is string {
  if (!href || !/^https?:\/\//i.test(href)) return false
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  return true
}
