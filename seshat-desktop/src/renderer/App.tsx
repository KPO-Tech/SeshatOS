import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router'
import { useAuth } from '@renderer/hooks/useAuth'
import { useInactivityTimeout } from '@renderer/hooks/useInactivityTimeout'
import { useSessionValidation } from '@renderer/hooks/useSessionValidation'
import { edition } from '@renderer/lib/edition'
import { hasSeenIntro, markIntroSeen } from '@renderer/lib/intro'
import { AppearanceIntro } from '@renderer/components/onboarding/AppearanceIntro'
import { SetupWizard } from '@renderer/components/setup/SetupWizard'
import { useSetup } from '@renderer/components/setup/useSetup'
import { Welcome } from '@renderer/pages/Welcome'
import { router } from '@renderer/router'

const MAX_START_ATTEMPTS = 8

function Splash({ children }: { children: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface-root)] text-[var(--text-primary)]">
      <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <span className="size-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent-primary)]" />
        {children}
      </div>
    </main>
  )
}

// Without accounts, the app opens this device's local session by itself. The
// backend may still be starting, so a failure is retried with a short backoff
// before the retry button appears.
function useLocalSession(enabled: boolean) {
  const { continueWithoutAccount } = useAuth()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    continueWithoutAccount().catch(() => {
      if (cancelled) return
      if (attempt + 1 >= MAX_START_ATTEMPTS) {
        setFailed(true)
        return
      }
      timer = setTimeout(() => setAttempt((value) => value + 1), Math.min(500 * 2 ** attempt, 5000))
    })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, attempt])

  return {
    failed,
    retry: () => {
      setFailed(false)
      setAttempt(0)
    }
  }
}

export function App() {
  const { isAuthenticated, restoring, restoreSession } = useAuth()
  // A new install opens on the choice of the appearance, before the sign-in screen (see AppearanceIntro).
  const [introDone, setIntroDone] = useState(() => hasSeenIntro())
  const local = useLocalSession(!edition.accounts && !restoring && !isAuthenticated && introDone)
  const setup = useSetup()

  useInactivityTimeout()
  useSessionValidation()

  useEffect(() => {
    void restoreSession()
  }, [])

  // Someone who is already signed in has been past it: signing out later does not bring it back.
  useEffect(() => {
    if (isAuthenticated && !introDone) {
      markIntroSeen()
      setIntroDone(true)
    }
  }, [isAuthenticated, introDone])

  if (restoring) return <Splash>Starting SeshatOS</Splash>

  if (!isAuthenticated) {
    if (!introDone) {
      return (
        <AppearanceIntro
          onContinue={() => {
            markIntroSeen()
            setIntroDone(true)
          }}
        />
      )
    }
    if (edition.accounts) return <Welcome />
    if (!local.failed) return <Splash>Starting SeshatOS</Splash>
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-root)] text-[var(--text-primary)]">
        <div className="grid justify-items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span>SeshatOS could not start its local engine.</span>
          <button
            type="button"
            onClick={local.retry}
            className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
          >
            Try again
          </button>
        </div>
      </main>
    )
  }

  if (setup.checking) return <Splash>Starting SeshatOS</Splash>
  if (setup.needed) return <SetupWizard setup={setup} />

  return <RouterProvider router={router} />
}
