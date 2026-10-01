export function ProviderEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-8 text-center text-[13px] font-semibold text-[var(--text-muted)]">
      {label}
    </div>
  )
}
