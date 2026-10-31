import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '@renderer/api/client'
import type { SystemStatus } from '@renderer/api/types'
import { edition } from '@renderer/lib/edition'
import { hasAdminAccess } from '@renderer/lib/authz'
import { useAuthStore } from '@renderer/stores/auth'
import { useDialogsStore } from '@renderer/stores/dialogs'

// One answer to "where does Settings / Admin go, and is Admin
// reachable" for every place that shows that menu. Each host owns its own
// trigger markup and open/close state.
export function useSettingsMenu() {
  const navigate = useNavigate()
  const roles = useAuthStore((state) => state.roles)
  const isAdmin = hasAdminAccess(roles)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!edition.cloud) return
    let cancelled = false
    api.get<SystemStatus>('/system/status')
      .then((status) => { if (!cancelled) setConnected(status.mode === 'connected') })
      .catch(() => { if (!cancelled) setConnected(false) })
    return () => { cancelled = true }
  }, [])

  function go(kind: 'settings' | 'admin') {
    if (kind === 'settings') useDialogsStore.getState().openSettings()
    else if (isAdmin) navigate('/admin')
  }

  return { isAdmin, connected, go }
}
