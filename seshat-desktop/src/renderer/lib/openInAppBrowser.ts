import type { MouseEvent } from 'react'
import { i18n } from '@renderer/i18n'
import { useUIStore } from '@renderer/stores/ui'

// Routes an http(s) link click to the app's own browser panel (main/browser-panel.ts) instead of the system browser.
//
// A click opens a new tab in the browser panel of the conversation: the link never replaces the tab the agent drives, and it does not go
// through browser.openUrl, which is the agent's path (it resolves a CDP target first and fails when that is not possible). sessionId scopes
// the tabs to one conversation (the `session:<id>` context of browser-panel.ts); without it, the conversation on screen is used.
//
// The right panel only exists on the pages that draw one: a conversation and Knowledge (see Shell.tsx). Elsewhere, and without the
// Electron bridge, the link goes to the system browser. The page is read from the address at each click, not kept in a variable: a value
// kept here would be lost when the module is evaluated again (a hot reload in development) and every link would then leave the app.

function currentRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

function hasPanelHost(route: string): boolean {
  return route.startsWith('/conversation/') || route.startsWith('/knowledge')
}

function conversationOnScreen(route: string): string | undefined {
  return route.match(/^\/conversation\/([^/?#]+)/)?.[1]
}

function openOutside(url: string): void {
  if (window.seshat?.openExternal) {
    void window.seshat.openExternal(url).catch(() => undefined)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openInAppBrowser(url: string, sessionId?: string): void {
  if (typeof window === 'undefined') return
  if (!/^https?:\/\//i.test(url)) return
  const browser = window.seshat?.browser
  const route = currentRoute()
  if (!browser || !hasPanelHost(route)) {
    openOutside(url)
    return
  }
  const session = sessionId || conversationOnScreen(route)
  useUIStore.getState().openRightPanel({ kind: 'browser', title: i18n.t('chat:chat.panels.computerPanel.browser'), sessionId: session })
  void browser.newTab(session ? `session:${session}` : 'chat', url).catch(() => openOutside(url))
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
