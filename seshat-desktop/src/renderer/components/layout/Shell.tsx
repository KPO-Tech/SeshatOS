import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { InternalExpansion } from '@icon-park/react'
import { useSessionsSync } from '@renderer/hooks/useSessionsSync'
import { useUIStore } from '@renderer/stores/ui'
import { DialogHost } from './DialogHost'
import { ErrorBoundary } from './ErrorBoundary'
import { ImageLightbox } from './ImageLightbox'
import { RightPanelHost } from './RightPanelHost'
import { Sidebar } from './sidebar/Sidebar'
import { ThemeToggleButton } from './ThemeToggleButton'
import { Titlebar } from './Titlebar'
import { TitlebarSessionControls } from './TitlebarSessionControls'

export function Shell() {
  const collapsed = useUIStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isConversation = pathname.startsWith('/conversation/')
  const conversationId = pathname.match(/^\/conversation\/([^/]+)/)?.[1] ?? null
  const isChatHome = pathname === '/'
  const isAdminRoute = pathname.startsWith('/admin')
  const previousConversationIdRef = useRef<string | null>(conversationId)

  useSessionsSync()

  // The right panel needs the window width to size itself.
  useEffect(() => {
    let frame: number | null = null
    function onResize() {
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        useUIStore.getState().setWindowWidth(window.innerWidth)
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  // Right panels (and the native browser view behind them) belong to one
  // conversation: leaving it, or switching to another, closes them.
  useEffect(() => {
    const previousConversationId = previousConversationIdRef.current
    if (conversationId) {
      if (previousConversationId && previousConversationId !== conversationId) {
        void window.nexus?.browser?.hide(`session:${previousConversationId}`).catch(() => undefined)
        useUIStore.getState().closeRightPanelsForSession(previousConversationId)
      }
      previousConversationIdRef.current = conversationId
      return
    }

    const browserContexts = new Set<string>(['chat'])
    for (const column of useUIStore.getState().rightColumns) {
      for (const panel of column.panels) {
        if (panel.kind === 'browser') {
          browserContexts.add(panel.sessionId ? `session:${panel.sessionId}` : 'chat')
        }
      }
    }
    if (previousConversationId) browserContexts.add(`session:${previousConversationId}`)

    useUIStore.getState().closeAllRightPanels()
    for (const contextId of browserContexts) {
      void window.nexus?.browser?.hide(contextId).catch(() => undefined)
    }
    previousConversationIdRef.current = null
  }, [conversationId])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--surface-root)] text-[var(--text-primary)]">
      <Titlebar
        right={(isChatHome || isConversation) ? <TitlebarSessionControls conversationId={conversationId} /> : undefined}
        onHome={() => navigate('/')}
        onBack={() => navigate(-1)}
        onForward={() => navigate(1)}
        afterNav={<ThemeToggleButton />}
        left={
          isAdminRoute ? undefined : (
            <button
              className="flex size-8 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
              type="button"
            >
              <InternalExpansion size={15} />
            </button>
          )
        }
      />

      <div className="relative flex flex-1 overflow-hidden">
        {/* Admin is its own immersive platform, not another sidebar
            destination - no trace of the chat sidebar, collapsed or not. */}
        {!isAdminRoute && <Sidebar />}
        <main
          className={
            isAdminRoute
              ? 'relative flex flex-1 overflow-hidden'
              : [
                  'relative flex flex-1 overflow-hidden transition-[padding-left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]',
                  collapsed ? 'pl-[var(--sidebar-collapsed-width)]' : 'pl-[var(--sidebar-width)]'
                ].join(' ')
          }
        >
          <div className="flex h-full min-w-0 flex-1 overflow-hidden">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
          {isConversation && <RightPanelHost />}
          <ImageLightbox />
        </main>
      </div>

      <DialogHost />
    </div>
  )
}
