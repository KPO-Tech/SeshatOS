import { useState, type ReactNode } from 'react'

export function ConfigCard({ title, description, status, children, action }: { title: string; description: string; status?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="overflow-visible rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-start justify-between gap-5 border-b border-[var(--border-soft)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
            {status}
          </div>
          <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">{description}</p>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function StatusPill({ tone, children }: { tone: 'ok' | 'muted' | 'warn'; children: ReactNode }) {
  return (
    <span
      className={[
        'inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold',
        tone === 'ok' ? 'bg-[var(--accent-success)]/10 text-[var(--accent-success)]' : '',
        tone === 'warn' ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]' : '',
        tone === 'muted' ? 'bg-[var(--surface-muted)] text-[var(--text-muted)]' : ''
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        'h-10 min-w-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]',
        props.className ?? ''
      ].join(' ')}
    />
  )
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        'h-10 min-w-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] font-semibold text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]',
        props.className ?? ''
      ].join(' ')}
    />
  )
}

export type SelectOption = {
  value: string
  label: string
  description?: string
  icon?: ReactNode
}

export function CustomSelect({ value, options, onChange, compact = false }: { value: string; options: SelectOption[]; onChange: (value: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value) ?? options[0]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={[
          'flex w-full items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2.5 text-left text-[13px] font-semibold text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)]',
          compact ? 'h-9' : 'h-10'
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {selected?.icon}
          <span className="truncate">{selected?.label ?? 'Select'}</span>
        </span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_18px_55px_rgba(0,0,0,0.45)]">
          <div className="no-scrollbar max-h-[260px] overflow-y-auto p-1.5" role="listbox">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={[
                  'flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors',
                  option.value === value
                    ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                ].join(' ')}
                role="option"
                aria-selected={option.value === value}
              >
                {option.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{option.label}</span>
                  {option.description && <span className="block truncate text-[11px] text-[var(--text-muted)]">{option.description}</span>}
                </span>
                {option.value === value && <CheckIcon />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function SoftButton({ children, tone = 'default', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger' | 'success' }) {
  return (
    <button
      {...props}
      className={[
        'inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-[12px] font-semibold transition-colors disabled:cursor-default disabled:opacity-45',
        tone === 'default' ? 'border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-panel)]' : '',
        tone === 'primary' ? 'border-[var(--accent-primary)]/35 bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/18' : '',
        tone === 'danger' ? 'border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/15' : '',
        tone === 'success' ? 'border-[var(--accent-success)]/35 bg-[var(--accent-success)]/10 text-[var(--accent-success)]' : '',
        props.className ?? ''
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={[
        'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
        enabled ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--surface-muted)]'
      ].join(' ')}
      aria-pressed={enabled}
    >
      <span className="size-4 rounded-full bg-white" />
    </button>
  )
}

export function ResultMessage({ state, error, latency }: { state: 'idle' | 'running' | 'ok' | 'error'; error: string | null; latency: number | null }) {
  if (state === 'idle' || state === 'running') return null
  if (state === 'ok') {
    return <div className="rounded-md border border-[var(--accent-success)]/30 bg-[var(--accent-success)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-success)]">Connected in {latency ?? 0}ms.</div>
  }
  return <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error ?? 'Connection failed.'}</div>
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 8 3 3 7-7" />
    </svg>
  )
}
