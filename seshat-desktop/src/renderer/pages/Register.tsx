import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { SystemStatus } from '@renderer/api/types'
import { AuthLayout } from '@renderer/components/auth/AuthLayout'
import {
  Alert,
  Checkbox,
  Field,
  InputWithIcon,
  LockIcon,
  MailIcon,
  PasswordToggle,
  PrimaryButton,
  UserIcon
} from '@renderer/components/auth/FormPrimitives'
import { useAuth } from '@renderer/hooks/useAuth'

type Props = {
  onLoginClick: () => void
}

type Requirement = {
  label: string
  met: boolean
}

function passwordRequirements(password: string): Requirement[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(password) },
    { label: 'Contains an uppercase letter', met: /[A-Z]/.test(password) }
  ]
}

export function Register({ onLoginClick }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registrationDisabled, setRegistrationDisabled] = useState(false)
  const { register } = useAuth()

  useEffect(() => {
    api.get<SystemStatus>('/system/status')
      .then((status) => setRegistrationDisabled(status.mode === 'connected'))
      .catch(() => setRegistrationDisabled(false))
  }, [])

  const requirements = passwordRequirements(password)
  const canSubmit = Boolean(name.trim() && email && requirements.every((requirement) => requirement.met) && agreed)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return

    setError('')
    setLoading(true)
    try {
      await register({ name: name.trim(), email, password })
    } catch (err) {
      setError((err as Error).message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (registrationDisabled) {
    return (
      <AuthLayout title="Account creation is managed" subtitle="This workspace is connected to a Seshat Server." mode="register">
        <div className="grid gap-4">
          <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
            Self-registration is disabled here. Ask your organization administrator to create an account for you, then sign in.
          </div>
          <PrimaryButton type="button" onClick={onLoginClick}>
            Go to sign in
          </PrimaryButton>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start a local SeshatOS workspace on this desktop." mode="register">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Field label="Full name">
          <InputWithIcon
            icon={<UserIcon />}
            type="text"
            value={name}
            onChange={setName}
            placeholder="Your full name"
            autoComplete="name"
            autoFocus
            required
          />
        </Field>

        <Field label="Email">
          <InputWithIcon
            icon={<MailIcon />}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="name@email.com"
            autoComplete="email"
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
              placeholder="Create a password"
              autoComplete="new-password"
              required
            />
            <PasswordToggle visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />
          </div>
        </Field>

        {password && (
          <div className="grid gap-1.5 text-[12px]">
            {requirements.map((requirement) => (
              <RequirementRow key={requirement.label} {...requirement} />
            ))}
          </div>
        )}

        <div className="flex items-start gap-2.5 text-[13px] leading-5 text-[var(--text-secondary)]">
          <Checkbox checked={agreed} onChange={setAgreed} />
          <span>I agree to the Terms and Privacy Policy.</span>
        </div>

        {error && <Alert>{error}</Alert>}

        <PrimaryButton loading={loading} disabled={!canSubmit}>
          Create account
        </PrimaryButton>

        <p className="m-0 pt-2 text-center text-[13px] text-[var(--text-secondary)]">
          Already have an account?{' '}
          <button type="button" onClick={onLoginClick} className="font-semibold text-[var(--accent-primary)] hover:underline">
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  )
}

function RequirementRow({ label, met }: Requirement) {
  return (
    <div className={['flex items-center gap-2', met ? 'text-[var(--accent-success)]' : 'text-[var(--text-muted)]'].join(' ')}>
      <span
        className={[
          'inline-flex size-4 items-center justify-center rounded-full border text-[9px]',
          met
            ? 'border-emerald-500/40 bg-emerald-500/15'
            : 'border-[var(--border-soft)]'
        ].join(' ')}
      >
        {met ? <RequirementCheckIcon /> : ''}
      </span>
      <span>{label}</span>
    </div>
  )
}

function RequirementCheckIcon() {
  return (
    <svg width="9" height="7" viewBox="0 0 9 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 3.5 3.4 6 8 1" />
    </svg>
  )
}
