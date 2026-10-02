import { useCallback, useEffect, useRef, useState } from 'react'
import { AddOne, Close, Globe, Left, LoadingOne, Refresh, Right } from '@icon-park/react'

// contextId scopes tabs/history to a single browsing session: the shared chat
// panel, or each project/session-specific Browser tab.
export function BrowserPanel({ url, contextId = 'chat' }: { url?: string; contextId?: string }) {
  const browserApi = window.nexus?.browser
  const initialUrl = url || 'https://www.google.com/'
  const viewportRef = useRef<HTMLDivElement>(null)
  const [address, setAddress] = useState(initialUrl)
  const [state, setState] = useState<BrowserPanelState | null>(null)
  const activeTab = state?.tabs.find((tab) => tab.id === state.activeTabId) ?? state?.tabs[0] ?? null

  const syncBounds = useCallback(() => {
    const element = viewportRef.current
    if (!element || !browserApi) return
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    void browserApi.setBounds(contextId, {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    }).catch(() => undefined)
  }, [browserApi, contextId])

  useEffect(() => {
    if (!browserApi) return
    const element = viewportRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    const bounds = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    void browserApi.show(contextId, bounds).then((next) => {
      setState(next)
      if (url || next.tabs.length === 0) {
        void browserApi.navigate(contextId, initialUrl).then(setState).catch(() => undefined)
        return
      }
      const activeUrl = next.tabs.find((tab) => tab.id === next.activeTabId)?.url ?? next.tabs[0]?.url
      if (activeUrl && activeUrl !== 'about:blank') setAddress(activeUrl)
    }).catch(() => undefined)

    const observer = new ResizeObserver(syncBounds)
    observer.observe(element)
    window.addEventListener('resize', syncBounds)
    window.addEventListener('scroll', syncBounds, true)
    const unsubscribeState = browserApi.onStateChange?.(contextId, (next) => {
      setState(next)
      const nextUrl = next.tabs.find((tab) => tab.id === next.activeTabId)?.url ?? next.tabs[0]?.url
      if (nextUrl && nextUrl !== 'about:blank') setAddress(nextUrl)
    })
    const frame = window.requestAnimationFrame(syncBounds)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', syncBounds)
      window.removeEventListener('scroll', syncBounds, true)
      unsubscribeState?.()
      void browserApi.hide(contextId).catch(() => undefined)
    }
  }, [browserApi, contextId, initialUrl, syncBounds, url])

  async function navigate() {
    const target = address.trim()
    if (!target || !browserApi) return
    const next = await browserApi.navigate(contextId, target).catch(() => null)
    if (next) setState(next)
  }

  function closeTab(event: React.MouseEvent, tabId: string) {
    event.stopPropagation()
    void browserApi?.closeTab(contextId, tabId).then(setState)
  }

  const tabs = state?.tabs ?? []

  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-app-md border border-app-border-subtle bg-app-bg">
      {tabs.length > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-app-border-subtle bg-app-surface px-2 pb-1.5 pt-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={[
                'flex max-w-[180px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[7px] border border-transparent px-2 py-1.5 text-left text-[var(--font-size-2xs)] font-semibold text-app-text-muted transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-app-text',
                tab.id === state?.activeTabId ? 'border-app-border-subtle bg-app-bg text-app-text' : '',
              ].join(' ')}
              onClick={() => void browserApi?.switchTab(contextId, tab.id).then(setState)}
            >
              {tab.status === 'loading' ? <LoadingOne className="animate-spin" size={11} /> : <Globe size={11} />}
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tab.label}</span>
              {tabs.length > 1 && (
                <span
                  className="ml-1 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text"
                  role="button"
                  aria-label="Close tab"
                  onClick={(event) => closeTab(event, tab.id)}
                >
                  <Close size={10} />
                </span>
              )}
            </button>
          ))}
          <button type="button" className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-app-border-subtle bg-app-bg text-app-text-secondary transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-app-text" onClick={() => void browserApi?.newTab(contextId).then(setState)} aria-label="New tab">
            <AddOne size={12} />
          </button>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1 border-b border-app-border-subtle bg-app-surface px-2 py-1.5">
        <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-app-text-secondary" type="button" onClick={() => void browserApi?.back(contextId).then(setState)} disabled={!activeTab?.canGoBack} aria-label="Back">
          <Left size={12} />
        </button>
        <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-app-text-secondary" type="button" onClick={() => void browserApi?.forward(contextId).then(setState)} disabled={!activeTab?.canGoForward} aria-label="Forward">
          <Right size={12} />
        </button>
        <button className="flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-app-text disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-app-text-secondary" type="button" onClick={() => void browserApi?.reload(contextId).then(setState)} aria-label="Reload">
          <Refresh size={12} />
        </button>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            void navigate()
          }}
        >
          <input
            className="h-7 w-full rounded-[8px] border border-app-border-subtle bg-app-bg px-2.5 text-[var(--font-size-sm)] text-app-text outline-none transition-colors duration-150 placeholder:text-app-text-muted focus:border-app-primary"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Search or enter website"
            spellCheck={false}
          />
        </form>
      </div>
      <div className="relative min-h-[260px] flex-1 overflow-hidden bg-white" ref={viewportRef}>
        {!browserApi && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--font-size-sm)] text-app-text-muted">
            <Globe size={18} />
            <span>Embedded browser is only available in the desktop app.</span>
          </div>
        )}
      </div>
    </div>
  )
}
