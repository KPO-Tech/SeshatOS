import type { ReactNode } from 'react'
import { formatBytes, type Choice } from './setupFormat'

type Option = { id: string; label: string; sizeBytes: number; description: string; recommended: boolean }

type Props = {
  title: string
  tagline: string
  icon: ReactNode
  available: boolean
  unavailableReason?: string
  /** Something to tell the person about this choice on this computer, shown while the box is off. */
  note?: string
  options: Option[]
  choice: Choice | undefined
  onChange: (choice: Choice) => void
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span
      className={[
        'mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border transition-colors duration-150',
        checked ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]' : 'border-[var(--border-strong)] bg-transparent'
      ].join(' ')}
      aria-hidden="true"
    >
      {checked && (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      )}
    </span>
  )
}

// One thing the person can have installed: a switch, a line on what it does, and the model to pick when it is on.
export function ComponentCard({ title, tagline, icon, available, unavailableReason, note, options, choice, onChange }: Props) {
  const on = available && Boolean(choice?.install)
  const selected = options.find((option) => option.id === choice?.modelId) ?? options[0]

  return (
    <section
      className={[
        'rounded-2xl border p-5 transition-all duration-200',
        on ? 'border-[color-mix(in_srgb,var(--accent-primary)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_7%,var(--surface-panel))]' : 'border-[var(--border-soft)] bg-[var(--surface-panel)]',
        available ? '' : 'opacity-55'
      ].join(' ')}
    >
      <button
        type="button"
        disabled={!available || !choice}
        onClick={() => choice && onChange({ ...choice, install: !choice.install })}
        className="flex w-full cursor-pointer items-start gap-4 border-0 bg-transparent p-0 text-left disabled:cursor-default"
        aria-pressed={on}
      >
        {available ? <Check checked={on} /> : <span className="mt-0.5 size-[22px] shrink-0" aria-hidden="true" />}
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] text-[var(--accent-primary)]">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-[var(--text-primary)]">{title}</span>
          <span className="mt-1 block text-[13.5px] leading-[1.5] text-[var(--text-muted)]">{available ? tagline : unavailableReason}</span>
        </span>
        {available && selected && on && <span className="shrink-0 pt-0.5 text-[12.5px] font-medium text-[var(--text-muted)]">{formatBytes(selected.sizeBytes)}</span>}
        {!available && (
          <span className="shrink-0 rounded-full border border-[var(--border-soft)] px-2.5 py-0.5 text-[11.5px] font-medium text-[var(--text-muted)]">Not in this version</span>
        )}
      </button>

      {available && !on && note && <p className="m-0 mt-3 ml-[54px] text-[12.5px] leading-[1.5] text-[var(--text-muted)]">{note}</p>}

      {on && choice && options.length > 0 && (
        <div className="mt-4 ml-[54px] grid gap-3">
          <div role="radiogroup" aria-label={`${title} model`} className="flex flex-wrap gap-2">
            {options.map((option) => {
              const active = option.id === choice.modelId
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ ...choice, modelId: option.id })}
                  className={[
                    'flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors duration-150',
                    active
                      ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] font-semibold text-[var(--text-primary)]'
                      : 'border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                  ].join(' ')}
                >
                  {option.label}
                  <span className="text-[12px] text-[var(--text-muted)]">{formatBytes(option.sizeBytes)}</span>
                  {option.recommended && (
                    <span className="rounded-full bg-[var(--accent-primary)] px-2 py-px text-[10.5px] font-semibold uppercase tracking-wide text-white">Recommended</span>
                  )}
                </button>
              )
            })}
          </div>
          {selected && <p className="m-0 text-[13px] leading-[1.5] text-[var(--text-muted)]">{selected.description}</p>}
        </div>
      )}
    </section>
  )
}
