type Props = {
  modelConnected: boolean
}

// What is left to do once the setup is over, in the order a person would do it. Nothing is shown when nothing is left.
export function SetupRecap({ modelConnected }: Props) {
  if (modelConnected) return null
  const next = ['Connect a model in Config, under Providers, so SeshatOS can answer.']

  return (
    <section className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-5 py-4" aria-label="What is left to do">
      <h2 className="m-0 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Still to do</h2>
      <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 text-[14px] leading-[1.5] text-[var(--text-secondary)]">
        {next.map((line) => (
          <li key={line} className="flex gap-3">
            <span className="mt-[8px] size-1.5 shrink-0 rounded-full bg-[var(--accent-primary)]" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>
    </section>
  )
}
