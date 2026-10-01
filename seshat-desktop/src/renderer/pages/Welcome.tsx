import { useState } from 'react'
import { AuthLayout } from '@renderer/components/auth/AuthLayout'
import { Alert, LinkButton, PrimaryButton, SecondaryButton } from '@renderer/components/auth/FormPrimitives'
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
    <AuthLayout title="Welcome to SeshatOS" subtitle="Sign in, create an account, or just get started locally." mode="welcome">
      <div className="grid gap-3">
        <PrimaryButton type="button" onClick={() => setCloudNotice(true)}>
          Log in
        </PrimaryButton>
        <SecondaryButton onClick={() => setCloudNotice(true)}>Create an account</SecondaryButton>
        <LinkButton onClick={() => setCloudNotice(true)}>Contact us for enterprise use</LinkButton>

        {cloudNotice && (
          <Alert>Cloud accounts aren't available in this build yet. Use "Continue without an account" below for now.</Alert>
        )}
        {error && <Alert>{error}</Alert>}

        <div className="my-3 h-px w-full bg-[var(--border-soft)]" />

        <div className="text-center">
          <LinkButton onClick={handleContinueWithoutAccount}>
            {loading ? 'Starting local session...' : 'Continue without an account'}
          </LinkButton>
        </div>
      </div>
    </AuthLayout>
  )
}
