export type SetupStep = 'welcome' | 'provider' | 'choose' | 'installing' | 'done'

const STEPS: Array<{ id: SetupStep; label: string }> = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'provider', label: 'Model' },
  { id: 'choose', label: 'Features' },
  { id: 'installing', label: 'Install' },
  { id: 'done', label: 'Done' }
]

// Where the person is in the setup: the steps passed are filled, the current one is named in full, the others only from a wide window.
export function StepBar({ current }: { current: SetupStep }) {
  const index = STEPS.findIndex((step) => step.id === current)
  return (
    <ol className="m-0 flex list-none items-center gap-2 p-0" aria-label="Setup steps">
      {STEPS.map((step, position) => {
        const state = position < index ? 'past' : position === index ? 'current' : 'next'
        return (
          <li key={step.id} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={[
                'flex size-[22px] items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-300',
                state === 'next' ? 'border border-[var(--border-strong)] text-[var(--text-muted)]' : 'bg-[var(--accent-primary)] text-white'
              ].join(' ')}
            >
              {state === 'past' ? (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              ) : (
                position + 1
              )}
            </span>
            <span
              className={[
                'text-[12.5px] transition-colors duration-300',
                state === 'current' ? 'font-semibold text-[var(--text-primary)]' : 'hidden text-[var(--text-muted)] sm:inline'
              ].join(' ')}
            >
              {step.label}
            </span>
            {position < STEPS.length - 1 && <span className={['hidden h-px w-6 sm:block', position < index ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-soft)]'].join(' ')} aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}
