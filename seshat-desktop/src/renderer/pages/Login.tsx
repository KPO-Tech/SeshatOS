import { useState } from 'react'
import { AuthLayout } from '@renderer/components/auth/AuthLayout'
import { Alert, Field, InputWithIcon, LockIcon, MailIcon, PasswordToggle, PrimaryButton } from '@renderer/components/auth/FormPrimitives'
import { useAuth } from '@renderer/hooks/useAuth'

type Props = {
  onRegisterClick: () => void
}

export function Login({ onRegisterClick }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!email || !password) return

    setError('')
    setLoading(true)
    try {
      await login({ email, password })
    } catch (err) {
      setError((err as Error).message || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to your SeshatOS workspace." mode="login">
      <form onSubmit={handleSubmit} className="grid gap-[18px]">
        <Field label="Email">
          <InputWithIcon
            icon={<MailIcon />}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="name@email.com"
            autoComplete="email"
            autoFocus
            required
          />
        </Field>

        <Field label="Password">
          <div className="relative">
            <InputWithIcon
              icon={<LockIcon />}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
            <PasswordToggle visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />
          </div>
        </Field>

        {error && <Alert>{error}</Alert>}

        <div className="pt-2">
          <PrimaryButton loading={loading} disabled={!email || !password}>
            Sign in
          </PrimaryButton>
        </div>

        <p className="m-0 pt-2 text-center text-[13px] text-[var(--text-secondary)]">
          No account yet?{' '}
          <button type="button" onClick={onRegisterClick} className="font-semibold text-[var(--accent-primary)] hover:underline">
            Create one
          </button>
        </p>
      </form>
    </AuthLayout>
  )
}
