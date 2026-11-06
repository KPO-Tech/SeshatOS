import { lazy, Suspense } from 'react'
import { useAuth } from '@renderer/hooks/useAuth'
import { useDialogsStore } from '@renderer/stores/dialogs'

// The window is large (every page of Settings is behind it) and closed at start: it loads the first time it is opened.
const SettingsModal = lazy(() => import('@renderer/components/settings/page/SettingsModal').then((m) => ({ default: m.SettingsModal })))

const GenerativeUiModal = lazy(() => import('@renderer/components/generative/GenerativeUiModal').then((m) => ({ default: m.GenerativeUiModal })))

// Shows the window of Settings, or of the Generative UI, when something asked for it (see stores/dialogs).
export function DialogHost() {
  const section = useDialogsStore((state) => state.section)
  const generative = useDialogsStore((state) => state.generative)
  const close = useDialogsStore((state) => state.close)
  const { user } = useAuth()

  if (!user || (!section && !generative)) return null
  return (
    <Suspense fallback={null}>
      {generative ? <GenerativeUiModal onClose={close} /> : section && <SettingsModal initialSection={section} onClose={close} />}
    </Suspense>
  )
}
