import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import { canManageKnowledge, type DeviceMode } from '@renderer/lib/authz'
import { useAuthStore } from '@renderer/stores/auth'

// The mode does not change while the app runs: ask the backend once, and share the answer between the menu and the routes.
let modeRequest: Promise<DeviceMode | null> | null = null

function loadMode(): Promise<DeviceMode | null> {
  modeRequest ??= api
    .get<{ mode?: DeviceMode }>('/system/status')
    .then((status) => status.mode ?? null)
    .catch(() => {
      // Asked again next time: a backend that was not up yet must not leave the menu without its pages for the whole run.
      modeRequest = null
      return null
    })
  return modeRequest
}

/** Whether the person can open the pages that manage Knowledge (Sources, Settings), and whether that is known yet. */
export function useCanManageKnowledge(): { allowed: boolean; known: boolean } {
  const roles = useAuthStore((state) => state.roles)
  const [mode, setMode] = useState<DeviceMode | null>(null)
  const [known, setKnown] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadMode().then((next) => {
      if (cancelled) return
      setMode(next)
      setKnown(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { allowed: canManageKnowledge(roles, mode), known }
}
