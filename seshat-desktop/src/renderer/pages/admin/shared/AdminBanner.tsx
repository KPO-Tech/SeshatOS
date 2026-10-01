// A dismissible error strip shown above a view's content - covers both a
// load failure (from the view's own data hook) and an action failure (from
// a create/update/delete call), whichever fired most recently.
export function AdminBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 px-3.5 py-2.5 text-[13px] text-[var(--accent-danger)]">
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="cursor-pointer border-0 bg-transparent text-[15px] leading-none text-[var(--accent-danger)] opacity-70 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  )
}
