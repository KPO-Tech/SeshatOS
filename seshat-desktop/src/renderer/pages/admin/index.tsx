import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Shield } from '@icon-park/react'
import { api } from '@renderer/api/client'
import type { SystemStatus } from '@renderer/api/types'
import { hasAdminAccess } from '@renderer/lib/authz'
import { useAuthStore } from '@renderer/stores/auth'
import { AdminNav, adminTabExists } from './AdminNav'
import { ORGANIZATION_TABS, type AdminTab } from './adminTabs'
import { OverviewView } from './overview/OverviewView'
import { UsersView } from './users/UsersView'
import { TeamsView } from './teams/TeamsView'
import { InvitationsView } from './invitations/InvitationsView'
import { ProvidersView } from './providers/ProvidersView'
import { DesktopPoliciesView } from './desktopPolicies/DesktopPoliciesView'
import { ConnectorsView } from './connectors/ConnectorsView'
import { AgentPresetsView } from './agents/AgentPresetsView'
import { MCPServersView } from './mcpServers/MCPServersView'
import { WebSearchView } from './webSearch/WebSearchView'
import { AuditLogsView } from './auditLogs/AuditLogsView'

function tabFromLocation(pathname: string, search: string): string | null {
  const queryTab = new URLSearchParams(search).get('tab')
  if (queryTab) return queryTab
  return pathname.startsWith('/admin/') ? pathname.slice('/admin/'.length).split('/')[0] : null
}

export function AdminPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const roles = useAuthStore((s) => s.roles)
  const isAdmin = hasAdminAccess(roles)
  const requestedTab = tabFromLocation(location.pathname, location.search)
  const [activeTab, setActiveTab] = useState<AdminTab>(adminTabExists(requestedTab) ? requestedTab : 'overview')
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    if (adminTabExists(requestedTab)) setActiveTab(requestedTab)
  }, [requestedTab])

  useEffect(() => {
    api.get<SystemStatus>('/system/status').then(setSystemStatus).catch(() => setSystemStatus(null))
  }, [])

  function selectTab(tab: AdminTab) {
    setActiveTab(tab)
    navigate(`/admin?tab=${tab}`)
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
        <Shield size={28} className="text-[var(--text-muted)]" />
        <h1 className="text-[15px] font-semibold text-[var(--text-primary)]">Admin access required</h1>
        <p className="text-[13px] text-[var(--text-muted)]">This console is reserved for organization administrators.</p>
      </div>
    )
  }

  const isConnected = systemStatus?.mode === 'connected'
  const locked = ORGANIZATION_TABS.has(activeTab) && !isConnected

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <AdminNav activeTab={activeTab} onSelect={selectTab} />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {locked ? (
          <OrganizationTabLocked onGoToSettings={() => navigate('/settings?tab=runtime')} />
        ) : (
          <AdminTabContent tab={activeTab} />
        )}
      </div>
    </div>
  )
}

function AdminTabContent({ tab }: { tab: AdminTab }) {
  switch (tab) {
    case 'overview':
      return <OverviewView />
    case 'users':
      return <UsersView />
    case 'teams':
      return <TeamsView />
    case 'invitations':
      return <InvitationsView />
    case 'providers':
      return <ProvidersView />
    case 'desktopPolicies':
      return <DesktopPoliciesView />
    case 'connectors':
      return <ConnectorsView />
    case 'agents':
      return <AgentPresetsView />
    case 'mcpServers':
      return <MCPServersView />
    case 'webSearch':
      return <WebSearchView />
    case 'auditLogs':
      return <AuditLogsView />
    default:
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1 text-center">
          <h1 className="text-[14px] font-semibold text-[var(--text-primary)]">Coming soon</h1>
          <p className="text-[13px] text-[var(--text-muted)]">This section hasn&apos;t been built yet.</p>
        </div>
      )
  }
}

function OrganizationTabLocked({ onGoToSettings }: { onGoToSettings: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 text-center">
      <Shield size={28} className="text-[var(--text-muted)]" />
      <h1 className="text-[15px] font-semibold text-[var(--text-primary)]">Connect to an organization</h1>
      <p className="max-w-[360px] text-[13px] text-[var(--text-muted)]">
        This section manages organization-wide data and only exists once this device is joined to a seshat-server organization.
      </p>
      <button
        type="button"
        onClick={onGoToSettings}
        className="mt-1 cursor-pointer rounded-md border-0 bg-[var(--accent-primary)] px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"
      >
        Go to Settings
      </button>
    </div>
  )
}
