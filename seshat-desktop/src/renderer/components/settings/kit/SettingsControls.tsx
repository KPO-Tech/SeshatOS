import type { ReactNode } from 'react'
import { ToggleSwitch } from '@renderer/components/config/knowledge/KnowledgePrimitives'

export { CustomSelect as SelectField, SoftButton as ActionButton } from '@renderer/components/config/knowledge/KnowledgePrimitives'
export type { SelectOption } from '@renderer/components/config/knowledge/KnowledgePrimitives'

export type Tone = 'ok' | 'muted' | 'warn'

const toneClass: Record<Tone, string> = {
  ok: 'bg-[var(--accent-success)]/10 text-[var(--accent-success)]',
  warn: 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]',
  muted: 'bg-[var(--surface-muted)] text-[var(--text-muted)]'
}

const dotClass: Record<Tone, string> = {
  ok: 'bg-[var(--accent-success)]',
  warn: 'bg-[var(--accent-primary)]',
  muted: 'bg-[var(--text-faint)]'
}

/** The state of a page or a card: green only when something is on. */
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ${toneClass[tone]}`}>
      <span className={`size-1.5 rounded-full ${dotClass[tone]}`} />
      {children}
    </span>
  )
}

/** A small capability or fact with a status dot. */
export function Chip({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)]">
      <span className={`size-1.5 rounded-full ${dotClass[tone]}`} />
      {children}
    </span>
  )
}

export function Toggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <span aria-label={label} className="inline-flex">
      <ToggleSwitch enabled={enabled} onChange={onChange} />
    </span>
  )
}

export type Choice<T extends string> = { value: T; label: string; icon?: ReactNode; hint?: string }

/** Options shown as cards: the picked one is outlined in orange. */
export function ChoiceCards<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<Choice<T>>; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/8' : 'border-[var(--border-soft)] bg-[var(--surface-panel)] hover:bg-[var(--surface-muted)]'}`}
          >
            {option.icon && (
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'}`}>{option.icon}</span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{option.label}</span>
              {option.hint && <span className="block truncate text-[11px] text-[var(--text-muted)]">{option.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
