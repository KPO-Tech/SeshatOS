import { WebContentsView, shell, type BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { assertTrustedSender } from './ipc/trusted-sender'

const BROWSER_SESSION_PARTITION = 'persist:seshat-browser'
const BROWSER_DEFAULT_URL = 'about:blank'
const BROWSER_HOME_URL = 'https://www.google.com/'
const TARGET_RESOLVE_TIMEOUT_MS = 2500
const TARGET_RESOLVE_INTERVAL_MS = 80
const DEFAULT_CONTEXT_ID = 'default'
// Agent-driven browser_open/browser_navigate tool calls always render into
// the conversation's own right panel (Conversation.tsx), never into a
// Projects workbench tab - so automation gets its own fixed context,
// separate from any project's browsing session.
const AUTOMATION_CONTEXT_ID = 'chat'

type BrowserPanelBounds = {
  x: number
  y: number
  width: number
  height: number
}

type BrowserPanelTab = {
  id: string
  label: string
  url: string
  status: 'loading' | 'ready'
  canGoBack: boolean
  canGoForward: boolean
}

type BrowserPanelState = {
  activeTabId: string | null
  tabs: BrowserPanelTab[]
}

type BrowserPanelOptions = {
  getWindow: () => BrowserWindow | null
  remoteDebugPort: number
}

type BrowserTab = {
  id: string
  view: WebContentsView
}

// One BrowserContext per "place" a browser can be opened from - the shared
// chat right panel, and one per project (keyed by normalized root path).
// Only one context's tab is ever attached to the window at a time, but
// every context keeps its own tabs/history alive in memory so switching
// between them (e.g. two different projects' Browser tabs) never bleeds
// state across, the way a single shared instance used to.
type BrowserContext = {
  tabs: BrowserTab[]
  activeTabId: string | null
}

function normalizeBrowserUrl(input?: string, fallback = BROWSER_DEFAULT_URL): string {
  const raw = typeof input === 'string' && input.trim() ? input.trim() : fallback
  if (!raw || raw === 'about:blank') return 'about:blank'
  if (/^https?:\/\//i.test(raw)) return raw
  // Address-bar text that isn't already a URL: treat it as a real host only
  // when it looks like one (no spaces, has a dot, or is localhost/an IP) -
  // otherwise it's a search query, same as typing into a normal browser's
  // omnibox, so route it through a search engine instead of trying (and
  // failing) to load it as a domain.
  const looksLikeHost = !/\s/.test(raw) && (/\.[a-z]{2,}$/i.test(raw) || /^localhost(:\d+)?$/i.test(raw) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(raw))
  if (looksLikeHost) return `https://${raw}`
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`
}

function normalizeBounds(bounds: BrowserPanelBounds): BrowserPanelBounds {
  return {
    x: Math.max(0, Math.round(Number(bounds.x) || 0)),
    y: Math.max(0, Math.round(Number(bounds.y) || 0)),
    width: Math.max(1, Math.round(Number(bounds.width) || 1)),
    height: Math.max(1, Math.round(Number(bounds.height) || 1)),
  }
}

function normalizeContextId(id?: string): string {
  const trimmed = typeof id === 'string' ? id.trim() : ''
  return trimmed || DEFAULT_CONTEXT_ID
}

function targetMarkerUrl(tabId: string): string {
  const marker = `seshat-browser-tab:${tabId}`
  const html = `<!doctype html><title>${marker}</title><meta name="seshat-browser-tab" content="${tabId}"><body>${marker}</body>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

export function createBrowserPanel({ getWindow, remoteDebugPort }: BrowserPanelOptions) {
  let tabCounter = 0
  const contexts = new Map<string, BrowserContext>()
  let currentContextId: string | null = null
  let visible = false
  let lastBounds: BrowserPanelBounds | null = null

  function cdpBrowserUrl(): string {
    return `http://127.0.0.1:${remoteDebugPort}`
  }

  function window(): BrowserWindow | null {
    const win = getWindow()
    return win && !win.isDestroyed() ? win : null
  }

  function send(channel: string, payload?: unknown) {
    const win = window()
    if (!win || win.webContents.isDestroyed()) return
    win.webContents.send(channel, payload)
  }

  function getContext(id: string): BrowserContext {
    let ctx = contexts.get(id)
    if (!ctx) {
      ctx = { tabs: [], activeTabId: null }
      contexts.set(id, ctx)
    }
    return ctx
  }

  function getTab(ctx: BrowserContext, id: string | null): BrowserTab | undefined {
    if (!id) return undefined
    return ctx.tabs.find((tab) => tab.id === id && !tab.view.webContents.isDestroyed())
  }

  function getActiveTab(ctx: BrowserContext): BrowserTab | undefined {
    return getTab(ctx, ctx.activeTabId)
  }

  function serializeTab(tab: BrowserTab): BrowserPanelTab {
    const webContents = tab.view.webContents
    const url = webContents.getURL()
    return {
      id: tab.id,
      label: webContents.getTitle() || (url === 'about:blank' ? 'New tab' : url),
      url,
      status: webContents.isLoading() ? 'loading' : 'ready',
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
    }
  }

  function state(contextId: string): BrowserPanelState {
    const ctx = getContext(contextId)
    return {
      activeTabId: ctx.activeTabId,
      tabs: ctx.tabs.filter((tab) => !tab.view.webContents.isDestroyed()).map(serializeTab),
    }
  }

  function broadcastState(contextId: string) {
    send('seshat:browser:state', { contextId, state: state(contextId) })
  }

  function attachActiveView() {
    const win = window()
    if (!win || !currentContextId || !visible || !lastBounds) return
    const tab = getActiveTab(getContext(currentContextId))
    if (!tab) return
    try {
      win.contentView.addChildView(tab.view)
      tab.view.setBounds(normalizeBounds(lastBounds))
      tab.view.webContents.focus()
    } catch (error) {
      console.warn('[browser] failed to attach view', error)
    }
  }

  function detachTabView(tab: BrowserTab | undefined) {
    const win = window()
    if (!win || !tab || tab.view.webContents.isDestroyed()) return
    try {
      win.contentView.removeChildView(tab.view)
    } catch {
      // Already detached.
    }
  }

  function detachCurrentView() {
    if (!currentContextId) return
    detachTabView(getActiveTab(getContext(currentContextId)))
  }

  // Makes contextId the one whose tab is attached to the window, detaching
  // whatever context was previously showing. Idempotent if already current.
  function bringContextToForeground(id: string) {
    if (currentContextId === id) return
    detachCurrentView()
    currentContextId = id
  }

  function wireTab(contextId: string, tab: BrowserTab) {
    const webContents = tab.view.webContents
    webContents.setWindowOpenHandler(({ url }) => {
      // A target=_blank / window.open() link opens as a real new tab in the
      // same context, matching how an actual browser behaves, instead of
      // hijacking whatever tab the user currently has open.
      if (/^https?:\/\//i.test(url)) {
        createTabInternal(contextId, url)
      } else {
        void shell.openExternal(url).catch(() => undefined)
      }
      return { action: 'deny' }
    })
    const onChange = () => broadcastState(contextId)
    webContents.on('did-start-loading', onChange)
    webContents.on('did-stop-loading', onChange)
    webContents.on('did-navigate', onChange)
    webContents.on('did-navigate-in-page', onChange)
    webContents.on('page-title-updated', onChange)
    webContents.on('destroyed', onChange)
  }

  function createTabInternal(contextId: string, rawUrl?: string): BrowserTab {
    const ctx = getContext(contextId)
    tabCounter += 1
    const tab: BrowserTab = {
      id: `tab_${Date.now().toString(36)}_${tabCounter.toString(36)}`,
      view: new WebContentsView({
        webPreferences: {
          partition: BROWSER_SESSION_PARTITION,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      }),
    }
    wireTab(contextId, tab)
    ctx.tabs.push(tab)
    void tab.view.webContents.loadURL(normalizeBrowserUrl(rawUrl)).catch((error) => {
      console.warn('[browser] initial navigation failed', error)
    })

    bringContextToForeground(contextId)
    ctx.activeTabId = tab.id
    attachActiveView()
    broadcastState(contextId)
    return tab
  }

  function closeTabInternal(contextId: string, tabId: string) {
    const ctx = getContext(contextId)
    const index = ctx.tabs.findIndex((tab) => tab.id === tabId)
    if (index === -1) return
    const [closed] = ctx.tabs.splice(index, 1)
    const wasActive = ctx.activeTabId === tabId
    detachTabView(closed)
    if (!closed.view.webContents.isDestroyed()) closed.view.webContents.close()

    if (!wasActive) {
      broadcastState(contextId)
      return
    }
    const next = ctx.tabs[index] ?? ctx.tabs[index - 1] ?? null
    if (next) {
      ctx.activeTabId = next.id
      if (currentContextId === contextId) attachActiveView()
    } else if (visible && currentContextId === contextId) {
      // Closing the last tab of the visible context - reopen a fresh home
      // tab instead of leaving the panel permanently blank.
      createTabInternal(contextId, BROWSER_HOME_URL)
      return
    } else {
      ctx.activeTabId = null
    }
    broadcastState(contextId)
  }

  function destroyContext(id: string) {
    const ctx = contexts.get(id)
    if (!ctx) return
    for (const tab of ctx.tabs) {
      detachTabView(tab)
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
    }
    contexts.delete(id)
    if (currentContextId === id) currentContextId = null
  }

  async function listCdpTargets(): Promise<Array<{ id?: string; type?: string; url?: string }>> {
    if (!remoteDebugPort || remoteDebugPort <= 0) return []
    const response = await fetch(`${cdpBrowserUrl()}/json/list`, { signal: AbortSignal.timeout(1000) })
    if (!response.ok) throw new Error(`CDP target list failed: HTTP ${response.status}`)
    const targets = await response.json()
    return Array.isArray(targets) ? targets : []
  }

  async function resolveCdpTargetId(tabId: string): Promise<string> {
    const marker = encodeURIComponent(`seshat-browser-tab:${tabId}`)
    const deadline = Date.now() + TARGET_RESOLVE_TIMEOUT_MS
    while (Date.now() < deadline) {
      const targets = await listCdpTargets().catch(() => [])
      const target = targets.find((candidate) => (
        candidate.type === 'page' &&
        typeof candidate.id === 'string' &&
        typeof candidate.url === 'string' &&
        candidate.url.includes(marker)
      ))
      if (target?.id) return target.id
      await new Promise((resolve) => setTimeout(resolve, TARGET_RESOLVE_INTERVAL_MS))
    }
    throw new Error('Could not resolve built-in browser CDP target.')
  }

  // Ensures a tab exists for contextId (creating one at about:blank if
  // needed), brings it to the foreground, and resolves its CDP target ID -
  // the shared core of openUrlForAutomation and resolveSessionTarget below.
  async function ensureTabTarget(contextId: string): Promise<{ targetId: string; tab: BrowserTab }> {
    visible = true
    const ctx = getContext(contextId)
    let tab = getActiveTab(ctx)
    if (tab) {
      bringContextToForeground(contextId)
      attachActiveView()
    } else {
      tab = createTabInternal(contextId, 'about:blank')
    }
    await tab.view.webContents.loadURL(targetMarkerUrl(tab.id))
    const targetId = await resolveCdpTargetId(tab.id)
    send('seshat:browser:panel-opened', { contextId, state: state(contextId) })
    return { targetId, tab }
  }

  async function openUrlForAutomation(rawUrl?: string, provider = 'auto', sessionId?: string) {
    const requestedProvider = String(provider || 'auto').trim().toLowerCase()
    if (requestedProvider !== 'auto' && requestedProvider !== 'builtin') {
      throw new Error(`Browser provider is not available yet: ${requestedProvider}`)
    }
    // Scoped per conversation when the caller knows which one triggered
    // this (agent browser_open/browser_navigate tool calls) - falls back to
    // the shared chat context otherwise, so different conversations never
    // mix tabs/history, matching the per-project isolation above.
    const id = sessionId ? `session:${sessionId}` : AUTOMATION_CONTEXT_ID
    const { targetId, tab } = await ensureTabTarget(id)
    const url = normalizeBrowserUrl(rawUrl)
    await tab.view.webContents.loadURL(url)
    return {
      provider: 'builtin',
      browser_url: cdpBrowserUrl(),
      target_id: targetId,
      tab_id: tab.id,
      url,
    }
  }

  // Used only by the local bridge server (see registerBridgeServer) so the
  // Go backend can attach a session's browser tool calls directly to this
  // tab before its first navigation, instead of racing
  // openUrlForAutomation's own best-effort URL push from the renderer side.
  async function resolveSessionTarget(sessionId: string): Promise<string> {
    const { targetId } = await ensureTabTarget(`session:${sessionId}`)
    return targetId
  }

  function trusted<T>(event: IpcMainInvokeEvent, fn: () => T): T {
    assertTrustedSender(event)
    return fn()
  }

  return {
    registerIpc(ipcMain: IpcMain) {
      ipcMain.handle('seshat:browser:show', (event, contextId: string, bounds?: BrowserPanelBounds) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        if (bounds) lastBounds = normalizeBounds(bounds)
        visible = true
        bringContextToForeground(id)
        const ctx = getContext(id)
        // Only seed a fresh tab (navigating to the home URL) when this
        // context has none yet - re-attaching an existing tab must not
        // reset its URL, otherwise every panel show/hide cycle would wipe
        // out whatever was being browsed.
        if (ctx.tabs.length === 0) {
          createTabInternal(id, BROWSER_HOME_URL)
        } else {
          attachActiveView()
        }
        send('seshat:browser:panel-opened', { contextId: id, state: state(id) })
        broadcastState(id)
        return state(id)
      }))
      ipcMain.handle('seshat:browser:hide', (event, contextId: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        visible = false
        if (currentContextId === id) detachCurrentView()
        send('seshat:browser:panel-closed', { contextId: id, state: state(id) })
        return state(id)
      }))
      ipcMain.handle('seshat:browser:bounds', (event, contextId: string, bounds: BrowserPanelBounds) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        lastBounds = normalizeBounds(bounds)
        if (visible && currentContextId === id) {
          getActiveTab(getContext(id))?.view.setBounds(lastBounds)
        }
        return state(id)
      }))
      ipcMain.handle('seshat:browser:state', (event, contextId: string) => trusted(event, () => state(normalizeContextId(contextId))))
      ipcMain.handle('seshat:browser:openUrl', (event, url?: string, provider?: string, sessionId?: string) => trusted(event, () => openUrlForAutomation(url, provider, sessionId)))
      ipcMain.handle('seshat:browser:navigate', (event, contextId: string, url?: string) => trusted(event, async () => {
        const id = normalizeContextId(contextId)
        const ctx = getContext(id)
        const active = getActiveTab(ctx)
        if (!active) {
          createTabInternal(id, url)
        } else {
          await active.view.webContents.loadURL(normalizeBrowserUrl(url)).catch((error) => {
            console.warn('[browser] navigation failed', error)
          })
        }
        broadcastState(id)
        return state(id)
      }))
      ipcMain.handle('seshat:browser:back', (event, contextId: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        const webContents = getActiveTab(getContext(id))?.view.webContents
        if (webContents?.canGoBack()) webContents.goBack()
        return state(id)
      }))
      ipcMain.handle('seshat:browser:forward', (event, contextId: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        const webContents = getActiveTab(getContext(id))?.view.webContents
        if (webContents?.canGoForward()) webContents.goForward()
        return state(id)
      }))
      ipcMain.handle('seshat:browser:reload', (event, contextId: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        getActiveTab(getContext(id))?.view.webContents.reload()
        return state(id)
      }))
      ipcMain.handle('seshat:browser:new-tab', (event, contextId: string, url?: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        visible = true
        createTabInternal(id, url || BROWSER_HOME_URL)
        send('seshat:browser:panel-opened', { contextId: id, state: state(id) })
        return state(id)
      }))
      ipcMain.handle('seshat:browser:close-tab', (event, contextId: string, tabId: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        closeTabInternal(id, String(tabId || ''))
        return state(id)
      }))
      ipcMain.handle('seshat:browser:switch-tab', (event, contextId: string, tabId: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        const ctx = getContext(id)
        const tab = getTab(ctx, String(tabId || ''))
        if (tab && tab.id !== ctx.activeTabId) {
          ctx.activeTabId = tab.id
          if (currentContextId === id) attachActiveView()
          broadcastState(id)
        }
        return state(id)
      }))
      ipcMain.handle('seshat:browser:destroy', (event, contextId: string) => trusted(event, () => {
        const id = normalizeContextId(contextId)
        visible = visible && currentContextId !== id
        destroyContext(id)
        return state(id)
      }))
    },
    resolveSessionTarget,
    destroy() {
      visible = false
      for (const id of contexts.keys()) destroyContext(id)
    },
  }
}
