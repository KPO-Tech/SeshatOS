const STEPS = ['Appearance', 'Get started', 'Connect']

/** Where the person is in the first screens: the ones passed are filled, the current one is named in orange, the others wait. */
export function IntroSteps({ current }: { current: number }) {
  return (
    <ol className="m-0 flex list-none items-center gap-3 p-0" aria-label="Steps">
      {STEPS.map((label, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={label} className="flex items-center gap-3" aria-current={active ? 'step' : undefined}>
            <span className="flex items-center gap-2.5">
              <span
                className={`flex size-[30px] items-center justify-center rounded-full text-[13px] font-semibold ${
                  active || done ? 'bg-[var(--accent-primary)] text-white' : 'border border-[var(--border-strong)] text-[var(--text-muted)]'
                }`}
              >
                {done ? (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m3.5 8.5 3 3 6-7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className={`text-[15px] ${active ? 'font-medium text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}`}>{label}</span>
            </span>
            {index < STEPS.length - 1 && <span className="h-px w-[72px] bg-[var(--border-strong)]" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}
