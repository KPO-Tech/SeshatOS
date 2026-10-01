import type { CSSProperties, ReactNode } from 'react'
import { Home, Left, Right } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { WindowCloseIcon, WindowMaximizeIcon, WindowMinimizeIcon } from '@renderer/components/ui/WindowControlIcon'

type Props = {
  left?: ReactNode
  // Renders right after the Home/Back/Forward group - for controls that
  // only make sense alongside navigation (e.g. the active conversation's
  // panel toggles), as opposed to `left`, which renders before it.
  afterNav?: ReactNode
  center?: ReactNode
  right?: ReactNode
  // Navigation is optional so the auth screens can render a bare titlebar.
  onHome?: () => void
  onBack?: () => void
  onForward?: () => void
}

const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties & { WebkitAppRegion: string }
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties & { WebkitAppRegion: string }

const navButtonClass = 'flex h-7 w-[26px] cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-[var(--text-muted)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
const systemButtonClass = 'flex h-[34px] w-[42px] cursor-pointer items-center justify-center border-0 bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)]'

// The app runs frameless, so every screen needs its own drag region and
// minimize / maximize / close.
export function Titlebar({ left, afterNav, center = 'SeshatOS', right, onHome, onBack, onForward }: Props) {
  const hasNavigation = Boolean(onHome || onBack || onForward)

  return (
    <div
      className="relative z-[50] flex h-[34px] shrink-0 items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-root)] px-2"
      style={dragStyle}
    >
      <div className="flex items-center gap-1" style={noDragStyle}>
        {left}
        {hasNavigation && (
          <div className="flex items-center gap-0.5" aria-label="Navigation">
            <button className={navButtonClass} onClick={onHome} aria-label="Home" type="button"><Home size={14} /></button>
            <button className={navButtonClass} onClick={onBack} aria-label="Back" type="button"><Left size={14} /></button>
            <button className={navButtonClass} onClick={onForward} aria-label="Forward" type="button"><Right size={14} /></button>
          </div>
        )}
        {afterNav}
      </div>

      {center && (
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 text-[11px] font-semibold tracking-[0.02em] text-[var(--text-muted)]">
          <SeshatLogo size={14} />
          <span>{center}</span>
        </div>
      )}

      <div className="flex items-center gap-1" style={noDragStyle}>
        {right && <div className="flex items-center">{right}</div>}
        <button className={systemButtonClass} onClick={() => void window.nexus?.window.minimize()} aria-label="Minimize" type="button">
          <WindowMinimizeIcon />
        </button>
        <button className={systemButtonClass} onClick={() => void window.nexus?.window.maximize()} aria-label="Maximize or restore" type="button">
          <WindowMaximizeIcon />
        </button>
        <button className={`${systemButtonClass} hover:bg-[var(--accent-danger)] hover:text-white`} onClick={() => void window.nexus?.window.close()} aria-label="Close" type="button">
          <WindowCloseIcon />
        </button>
      </div>
    </div>
  )
}
