import { Attention } from '@icon-park/react'
import type { AskAction, AskNotice } from './askReadiness'

type Props = {
  notices: AskNotice[]
  onAction: (action: AskAction) => void
}

// What will make the answers worse without stopping them, as a slim line above the input.
export function AskNotices({ notices, onAction }: Props) {
  if (notices.length === 0) return null
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className="flex items-start gap-2.5 rounded-[12px] border border-[color-mix(in_srgb,var(--accent-primary)_30%,var(--border-soft))] bg-[color-mix(in_srgb,var(--accent-primary)_6%,var(--surface-panel))] px-3 py-2"
        >
          <span className="mt-px shrink-0 text-[var(--accent-primary)]">
            <Attention size={15} />
          </span>
          <p className="m-0 min-w-0 flex-1 text-[12.5px] leading-[18px] text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{notice.title}.</span> {notice.text}
          </p>
          {notice.action && (
            <button
              type="button"
              onClick={() => onAction(notice.action!.id)}
              className="shrink-0 cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-[12.5px] font-semibold text-[var(--accent-primary)] hover:underline"
            >
              {notice.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
