import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</span>
      {children}
    </label>
  )
}

type InputProps = {
  icon: ReactNode
  type: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  autoFocus?: boolean
  required?: boolean
  autoComplete?: string
}

export function InputWithIcon({ icon, type, value, onChange, placeholder, autoFocus, required, autoComplete }: InputProps) {
  return (
    <div className="flex h-11 items-center gap-2.5 rounded-[10px] border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3.5 transition-colors focus-within:border-[var(--accent-primary)]">
      <span className="flex shrink-0 text-[var(--text-muted)]">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        autoComplete={autoComplete}
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
      />
    </div>
  )
}

export function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
      aria-label={visible ? 'Hide password' : 'Show password'}
    >
      {visible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  )
}

export function Checkbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
        checked ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white' : 'border-[var(--border-strong)] bg-transparent'
      ].join(' ')}
      aria-pressed={checked}
    >
      {checked && <CheckIcon />}
    </button>
  )
}

export function PrimaryButton({
  children,
  loading,
  disabled,
  type = 'submit',
  onClick
}: {
  children: ReactNode
  loading?: boolean
  disabled?: boolean
  type?: 'submit' | 'button'
  onClick?: () => void
}) {
  const inactive = disabled || loading
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={inactive}
      className={[
        'flex h-[46px] w-full items-center justify-center rounded-[10px] text-sm font-semibold transition-colors',
        inactive
          ? 'cursor-default bg-[var(--surface-muted)] text-[var(--text-muted)]'
          : 'bg-[var(--text-primary)] text-[var(--surface-root)] hover:opacity-90'
      ].join(' ')}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </button>
  )
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[13px] leading-5 text-[var(--accent-danger)]">
      {children}
    </div>
  )
}

export function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M10.7 5.1A10.5 10.5 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7" />
      <path d="M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
      <path d="m2 2 20 20" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 4 3.7 6.6 9 1" />
    </svg>
  )
}
