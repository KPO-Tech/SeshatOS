import { useEffect } from 'react'
import { ConfigModal } from '@renderer/components/config/ConfigModal'
import { SettingsModal } from '@renderer/components/settings/SettingsModal'
import { useAuth } from '@renderer/hooks/useAuth'
import { useDialogsStore } from '@renderer/stores/dialogs'
import { useOverlayStore } from '@renderer/stores/overlay'

// Renders the Settings and Config modals and tells the overlay store whether a
// modal is covering the app (used to freeze the native browser view).
export function DialogHost() {
  const settingsSection = useDialogsStore((state) => state.settingsSection)
  const configSection = useDialogsStore((state) => state.configSection)
  const { user, logout } = useAuth()
  const anyOpen = Boolean(settingsSection || configSection)

  useEffect(() => {
    useOverlayStore.getState().setModalOpen(anyOpen)
  }, [anyOpen])

  useEffect(() => {
    if (!anyOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && useDialogsStore.getState().closeTopmost()) event.preventDefault()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [anyOpen])

  if (!user) return null

  return (
    <>
      {settingsSection && (
        <SettingsModal
          user={user}
          initialSection={settingsSection}
          onLogout={() => void logout()}
          onClose={() => useDialogsStore.setState({ settingsSection: null })}
        />
      )}
      {configSection && (
        <ConfigModal
          user={user}
          initialSection={configSection}
          onClose={() => useDialogsStore.setState({ configSection: null })}
        />
      )}
    </>
  )
}
