import { useState } from 'react'
import type { ReactNode } from 'react'
import { AddUser, Computer, Login, Right } from '@icon-park/react'
import { Alert, LinkButton } from '@renderer/components/auth/FormPrimitives'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { Titlebar } from '@renderer/components/layout/Titlebar'
import { IntroBackdrop } from '@renderer/components/onboarding/IntroBackdrop'
import { IntroSteps } from '@renderer/components/onboarding/IntroSteps'
import { useAuth } from '@renderer/hooks/useAuth'

// Cloud accounts (individual or enterprise) are served by Seshat's cloud
// identity provider, which isn't deployed yet - Log in/Create account/
// Contact us all surface that plainly instead of pretending to work (and
// deliberately do NOT fall back to this backend's own local Login/Register
// forms, which would create another local multi-user account on this
// install - exactly what "create an account" must never mean going
// forward). "Continue without an account" is the one option that is fully
// live today: it mints a session for this install's local, auto-
// provisioned identity, no email or password involved - see
// internal/auth/local_provider.go's EnsureImplicitSession on the backend.
export function Welcome() {
  const [cloudNotice, setCloudNotice] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { continueWithoutAccount } = useAuth()

  async function handleContinueWithoutAccount() {
    setError('')
    setLoading(true)
    try {
      await continueWithoutAccount()
    } catch (err) {
      setError((err as Error).message || 'Could not start a local session. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[var(--surface-root)] text-[var(--text-primary)]">
      <IntroBackdrop />
      <Titlebar bare center={null} />

      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-8 pt-1">
        <div className="flex flex-col items-center text-center">
          <SeshatLogo size={52} />
          <div className="text-[34px] font-semibold leading-tight tracking-[-0.01em]">
            Seshat<span className="text-[var(--accent-primary)]">OS</span>
          </div>
          <h1 className="m-0 mt-4 text-[30px] font-semibold leading-tight">Let's get you started</h1>
          <p className="m-0 mt-2 text-[15px] text-[var(--text-secondary)]">Work on this computer right away, or bring your account.</p>
        </div>

        <div className="mt-5">
          <IntroSteps current={1} />
        </div>

        <section className="mt-6 grid w-full max-w-[620px] gap-3 rounded-3xl border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-panel)_82%,transparent)] p-6 backdrop-blur-sm">
          <Choice
            primary
            icon={<Computer theme="outline" size={26} />}
            title={loading ? 'Starting your workspace...' : 'Continue on this computer'}
            hint="No account needed. Your chats, files and memory stay here."
            badge="Recommended"
            onClick={handleContinueWithoutAccount}
          />
          <Choice icon={<Login theme="outline" size={26} />} title="Log in" hint="Use your SeshatOS account." onClick={() => setCloudNotice(true)} />
          <Choice icon={<AddUser theme="outline" size={26} />} title="Create an account" hint="Sync your workspace across devices." onClick={() => setCloudNotice(true)} />

          {cloudNotice && <Alert>Cloud accounts aren't available in this build yet. Use "Continue on this computer" for now.</Alert>}
          {error && <Alert>{error}</Alert>}

          <div className="mt-1 text-center">
            <LinkButton onClick={() => setCloudNotice(true)}>Contact us for enterprise use</LinkButton>
          </div>
        </section>
      </main>
    </div>
  )
}

function Choice({ icon, title, hint, badge, primary, onClick }: { icon: ReactNode; title: string; hint: string; badge?: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full cursor-pointer items-center gap-4 rounded-2xl border-2 p-4 text-left transition-colors ${
        primary
          ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]'
          : 'border-[var(--border-soft)] bg-transparent hover:border-[var(--border-strong)]'
      }`}
    >
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${primary ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--surface-panel)] text-[var(--accent-primary)]'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[16px] font-semibold text-[var(--text-primary)]">
          {title}
          {badge && <span className="rounded-full bg-[var(--accent-primary)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-white">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[13px] text-[var(--text-secondary)]">{hint}</span>
      </span>
      <span className="shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5">
        <Right theme="outline" size={18} />
      </span>
    </button>
  )
}
