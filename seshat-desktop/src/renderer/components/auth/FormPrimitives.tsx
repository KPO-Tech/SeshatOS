import type { ReactNode } from 'react'

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

export function SecondaryButton({
  children,
  onClick
}: {
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[46px] w-full items-center justify-center rounded-[10px] border border-[var(--border-strong)] bg-transparent text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
    >
      {children}
    </button>
  )
}

export function LinkButton({
  children,
  onClick
}: {
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:underline"
    >
      {children}
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
