type Props = {
  /** True when the reader has scrolled up far enough to want a way back. */
  away: boolean
  onJump: () => void
}

/** A round arrow just above the composer that returns to the last message. Put it between the messages and the composer. */
export function JumpToLatest({ away, onJump }: Props) {
  return (
    <div className="conv-jump-anchor">
      {away && (
        <button type="button" className="conv-jump" onClick={onJump} title="Go to the latest message" aria-label="Go to the latest message">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3v9.5M3.75 8.5 8 12.75l4.25-4.25" />
          </svg>
        </button>
      )}
    </div>
  )
}
