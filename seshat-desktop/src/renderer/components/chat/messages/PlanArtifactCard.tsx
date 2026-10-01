import { memo } from 'react'
import { CheckOne, CloseOne, DocDetail } from "@icon-park/react"
import { useUIStore } from '@renderer/stores/ui'
import type { PlanDocument } from '@renderer/api/types'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const BADGE_CSS: Record<PlanDocument['status'], string> = {
  pending: 'bg-[rgba(239,124,47,0.15)] text-[var(--color-accent)]',
  validated: 'bg-[rgba(var(--color-success-rgb),0.12)] text-app-success',
  rejected: 'bg-[rgba(var(--color-error-rgb),0.1)] text-app-error',
}

type Props = {
  plan: PlanDocument
  sessionId: string
  onProceed?: (planId: string) => void
  // Absent (not just a no-op) hides the Reject button entirely - callers
  // that can't guarantee a clean deny path (e.g. no session context) can
  // leave this unset rather than wiring a button that does nothing.
  onReject?: (planId: string) => void
  // Suppresses the Proceed/Reject footer regardless of plan.status - used
  // when this card is rendered as the historical record of a submit_plan
  // tool call (see SilentToolView), where the real action surface is the
  // card shown above the input (or the panel itself); this instance is just
  // a "reopen to view" affordance, not a second place to act from.
  readOnly?: boolean
}

export const PlanArtifactCard = memo(function PlanArtifactCard({ plan, sessionId, onProceed, onReject, readOnly }: Props) {
  const openRightPanel = useUIStore((s) => s.openRightPanel)

  function openPanel(e: React.MouseEvent) {
    e.stopPropagation()
    openRightPanel({
      kind: 'plan',
      title: plan.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      sessionId,
      planId: plan.id,
    })
  }

  function handleProceed(e: React.MouseEvent) {
    e.stopPropagation()
    onProceed?.(plan.id)
  }

  function handleReject(e: React.MouseEvent) {
    e.stopPropagation()
    onReject?.(plan.id)
  }

  return (
    <div className="flex max-w-[420px] flex-col">
      <div
        className="flex max-w-[420px] cursor-pointer select-none items-stretch overflow-hidden rounded-[9px] border border-app-border-subtle bg-app-surface transition-[border-color,box-shadow] duration-150 hover:border-[rgba(239,124,47,0.4)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.15)]"
        onClick={openPanel}
        role="button"
        tabIndex={0}
      >
        <div className="flex shrink-0 flex-col items-center justify-center border-r border-app-border-subtle bg-[rgba(239,124,47,0.07)] px-2.5 py-2.5 text-[var(--color-accent)]">
          <DocDetail size={16} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px] px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-semibold text-app-text">
              {plan.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
            <span className={cx('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]', BADGE_CSS[plan.status])}>{plan.status}</span>
          </div>
          <div className="text-[10px] text-app-text-muted">{plan.filename} · v{plan.version} · Click to review</div>
        </div>
      </div>
      {!readOnly && plan.status === 'pending' && (
        <div className="flex shrink-0 items-center justify-between px-2.5 pb-1.5 pt-1.5">
          <span className="text-[10px] text-app-text-muted">Review and approve to continue execution</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {onReject && (
              <button
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-app-border-subtle bg-transparent px-2 py-1 text-[10px] font-semibold text-app-text-muted transition-all duration-150 hover:border-[rgba(var(--color-error-rgb),0.3)] hover:bg-[rgba(var(--color-error-rgb),0.08)] hover:text-app-error"
                type="button"
                onClick={handleReject}
              >
                <CloseOne size={10} />
                Reject
              </button>
            )}
            <button
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[rgba(var(--color-success-rgb),0.3)] bg-[rgba(var(--color-success-rgb),0.12)] px-2 py-1 text-[10px] font-semibold text-app-success transition-all duration-150 hover:border-[rgba(var(--color-success-rgb),0.5)] hover:bg-[rgba(var(--color-success-rgb),0.22)]"
              type="button"
              onClick={handleProceed}
            >
              <CheckOne size={10} />
              Proceed
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
