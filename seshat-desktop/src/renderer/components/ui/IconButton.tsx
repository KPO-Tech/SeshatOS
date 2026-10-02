type Props = {
  icon: React.ReactNode
  onClick?: () => void
  title?: string
  variant?: 'ghost' | 'bordered'
  size?: number
  className?: string
  active?: boolean
  activeColor?: 'orange' | 'green' | 'red'
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function IconButton({ icon, onClick, title, variant = 'ghost', size = 32, className, active, activeColor = 'orange' }: Props) {
  return (
    <button
      className={cx(
        'flex shrink-0 cursor-pointer items-center justify-center rounded-lg transition-[background,color,border-color] duration-150',
        variant === 'ghost'
          ? 'border-0 bg-transparent text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text'
          : 'border border-app-border-subtle bg-transparent text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text',
        active && activeColor === 'green' && '!border-[rgba(var(--color-success-rgb),0.25)] !bg-[rgba(var(--color-success-rgb),0.1)] !text-app-success',
        active && activeColor === 'red' && '!border-[rgba(var(--color-error-rgb),0.3)] !bg-[rgba(var(--color-error-rgb),0.12)] !text-app-error',
        active && activeColor === 'orange' && '!border-[rgba(239,124,47,0.3)] !bg-[rgba(239,124,47,0.12)] !text-[var(--accent-primary)]',
        className,
      )}
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={title}
    >
      {icon}
    </button>
  )
}
