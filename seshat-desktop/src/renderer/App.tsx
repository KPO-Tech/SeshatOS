import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router'
import { useAuth } from '@renderer/hooks/useAuth'
import { useInactivityTimeout } from '@renderer/hooks/useInactivityTimeout'
import { useSessionValidation } from '@renderer/hooks/useSessionValidation'
import { Login } from '@renderer/pages/Login'
import { Register } from '@renderer/pages/Register'
import { router } from '@renderer/router'

export function App() {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const { isAuthenticated, restoring, restoreSession } = useAuth()

  useInactivityTimeout()
  useSessionValidation()

  useEffect(() => {
    void restoreSession()
  }, [])

  if (restoring) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-root)] text-[var(--text-primary)]">
        <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span className="size-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent-primary)]" />
          Restoring session
        </div>
      </main>
    )
  }

  if (!isAuthenticated) {
    return authMode === 'login'
      ? <Login onRegisterClick={() => setAuthMode('register')} />
      : <Register onLoginClick={() => setAuthMode('login')} />
  }

  return <RouterProvider router={router} />
}
