import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApplicationOne, Browser, Plus, Puzzle, Search, Time, Workbench } from '@icon-park/react'
import { useSettingsMenu } from '@renderer/hooks/useSettingsMenu'
import { SearchModal } from '@renderer/components/layout/SearchModal'
import { SessionHistoryModal } from '@renderer/components/layout/SessionHistoryModal'
import { useSessionStore } from '@renderer/stores/session'
import { SIDEBAR_DEFAULT_WIDTH, useUIStore } from '@renderer/stores/ui'
import { RecentSessions } from './RecentSessions'
import { SidebarFooterMenu } from './SidebarFooterMenu'
import { SidebarItem } from './SidebarItem'
import { resolveProjectContextPath, selectRecentSessions } from '@renderer/lib/projects'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function Sidebar() {
  const collapsed = useUIStore((state) => state.sidebarCollapsed)
  const setSidebarWidth = useUIStore((state) => state.setSidebarWidth)
  const sessions = useSessionStore((state) => state.sessions)
  const activeId = useSessionStore((state) => state.activeId)
  const setActive = useSessionStore((state) => state.setActive)
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { connected } = useSettingsMenu()
  const [searchOpen, setSearchOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const projectContextPath = useMemo(
    () => resolveProjectContextPath(
      {
        projectParam: new URLSearchParams(search).get('project'),
        projectRouteId: pathname.match(/^\/projects\/([^/]+)/)?.[1],
        conversationRouteId: pathname.match(/^\/conversation\/([^/]+)/)?.[1]
      },
      sessions
    ),
    [pathname, search, sessions]
  )
  const recentSessions = useMemo(() => selectRecentSessions(sessions, projectContextPath), [sessions, projectContextPath])
  const scopedSessions = useMemo(() => selectRecentSessions(sessions, projectContextPath, Number.MAX_SAFE_INTEGER), [sessions, projectContextPath])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  function startNewChat() {
    navigate(projectContextPath ? `/?project=${encodeURIComponent(projectContextPath)}` : '/')
    setActive(null)
  }

  function openSession(id: string) {
    setActive(id)
    navigate(`/conversation/${id}`)
  }

  function handleHistoryDeleted(ids: string[]) {
    if (activeId && ids.includes(activeId)) {
      setActive(null)
      navigate('/')
    }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const root = document.documentElement
    root.setAttribute('data-sidebar-resizing', '')
    function onMove(move: PointerEvent) {
      setSidebarWidth(move.clientX)
    }
    function onUp() {
      root.removeAttribute('data-sidebar-resizing')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const item = (path: string) => pathname === path || pathname.startsWith(`${path}/`)

  return (
    <>
      <aside
        className="absolute inset-y-0 left-0 z-[40] flex flex-col overflow-hidden border-r border-[var(--border-soft)] bg-[var(--surface-sidebar)] transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] [html[data-sidebar-resizing]_&]:transition-none"
        style={{ width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)' }}
      >
        <div className={cx('flex flex-col gap-px px-2 pb-1 pt-3.5', collapsed && 'items-center')}>
          <SidebarItem icon={<Plus theme="outline" size={16} />} label="New Chat" collapsed={collapsed} active={pathname === '/' && !activeId} onClick={startNewChat} />
          <SidebarItem icon={<Search theme="outline" size={16} />} label="Search" shortcut="Ctrl K" collapsed={collapsed} onClick={() => setSearchOpen(true)} />
          {!projectContextPath && (
            <>
              <SidebarItem icon={<ApplicationOne theme="outline" size={16} />} label="Skills" collapsed={collapsed} active={item('/skills')} onClick={() => navigate('/skills')} />
              <SidebarItem icon={<Puzzle theme="outline" size={16} />} label="Plugins" collapsed={collapsed} active={item('/plugins')} onClick={() => navigate('/plugins')} />
              {connected && (
                <SidebarItem icon={<Time theme="outline" size={16} />} label="Scheduling" collapsed={collapsed} active={item('/scheduling')} onClick={() => navigate('/scheduling')} />
              )}
              <SidebarItem icon={<Browser theme="outline" size={16} />} label="Store" collapsed={collapsed} active={item('/store')} onClick={() => navigate('/store')} />
              <SidebarItem icon={<Workbench theme="outline" size={16} />} label="Projects" collapsed={collapsed} active={item('/projects')} onClick={() => navigate('/projects')} />
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 py-2">
          {!collapsed && <RecentSessions sessions={recentSessions} onOpenSession={openSession} onOpenHistory={() => setHistoryOpen(true)} />}
        </div>

        <SidebarFooterMenu collapsed={collapsed} />

        {!collapsed && (
          <div
            className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-[var(--accent-primary)]/40"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={startResize}
            onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          />
        )}
      </aside>

      <SessionHistoryModal
        open={historyOpen}
        sessions={scopedSessions}
        scopeLabel={projectContextPath ? 'project' : 'Home'}
        onClose={() => setHistoryOpen(false)}
        onOpenSession={openSession}
        onDeleted={handleHistoryDeleted}
      />
      <SearchModal open={searchOpen} sessions={sessions} onClose={() => setSearchOpen(false)} onSelect={openSession} />
    </>
  )
}
