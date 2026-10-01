// Stand-in for a zone that hasn't been migrated yet, so the shell's navigation
// is real from day one. Each zone replaces its placeholder as it lands.
export function RoutePlaceholder({ title }: { title: string }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-center">
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h1>
      <p className="text-[13px] text-[var(--text-muted)]">Not migrated yet.</p>
    </section>
  )
}
