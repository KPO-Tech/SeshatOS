import { Plus } from '@icon-park/react'
import type { ReactNode } from 'react'

// Title (or a filter-tabs row in its place) plus one primary action button -
// the same header shape across every Admin sub-view.
export function AdminPageHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: ReactNode
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
      <div className="min-w-0 text-[17px] font-semibold text-[var(--text-primary)]">{title}</div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-[var(--accent-primary)] px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90"
        >
          <Plus size={13} /> {actionLabel}
        </button>
      )}
    </div>
  )
}
