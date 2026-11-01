import { useCallback, useEffect, useState } from 'react'
import { getPrefs, PREFS_EVENT, setPrefs, type NotificationPrefs } from '@renderer/lib/notifications'

/** The choices about what the app tells the person, as Settings > General shows them; kept on this computer. */
export function useNotificationPrefs() {
  const [prefs, setState] = useState<NotificationPrefs>(() => getPrefs())

  useEffect(() => {
    const onChange = () => setState(getPrefs())
    window.addEventListener(PREFS_EVENT, onChange)
    return () => window.removeEventListener(PREFS_EVENT, onChange)
  }, [])

  const change = useCallback((key: keyof NotificationPrefs, value: boolean) => setPrefs({ ...getPrefs(), [key]: value }), [])
  return { prefs, change }
}
