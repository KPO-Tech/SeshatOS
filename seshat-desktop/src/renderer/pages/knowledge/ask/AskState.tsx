import { FolderOpen, PlugOne } from '@icon-park/react'
import type { AskAction, AskStop } from './askReadiness'

type Props = {
  stop: AskStop
  onAction: (action: AskAction) => void
}

// What takes the place of the start of the Ask screen when no question can be asked: the collections could not be read, or there are none.
export function AskState({ stop, onAction }: Props) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 pb-10 pt-6 text-center" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }} role={stop.kind === 'unavailable' ? 'alert' : 'status'}>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent-primary)] [&_svg]:size-[22px]">
        {stop.kind === 'unavailable' ? <PlugOne size={22} /> : <FolderOpen size={22} />}
      </span>
      <h2 className="m-0 mt-5 text-[26px] font-normal leading-[1.2] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
        {stop.title}
      </h2>
      <p className="m-0 mt-3 max-w-[440px] text-[13.5px] leading-[21px] text-[var(--text-muted)]">{stop.text}</p>
      {stop.action && (
        <button
          type="button"
          onClick={() => onAction(stop.action!.id)}
          className="mt-5 cursor-pointer rounded-[10px] border-0 bg-[var(--accent-primary)] px-4 py-2 text-[13px] font-semibold text-[var(--text-on-accent,#fff)] hover:opacity-90"
        >
          {stop.action.label}
        </button>
      )}
    </div>
  )
}
