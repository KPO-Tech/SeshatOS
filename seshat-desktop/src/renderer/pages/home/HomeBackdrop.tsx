/**
 * The light behind the welcome: a warm glow around the mark and two slow lines of the same colour that cross the page. It is drawn from the
 * accent of the theme, quieter on a light one, and it never takes a click.
 */
export function HomeBackdrop() {
  return (
    <div className="home-backdrop" aria-hidden="true">
      <svg viewBox="0 0 1600 420" preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id="home-wave-a" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--accent-primary)" stopOpacity="0" />
            <stop offset="0.35" stopColor="var(--accent-primary)" stopOpacity="0.55" />
            <stop offset="0.65" stopColor="var(--accent-primary)" stopOpacity="0.4" />
            <stop offset="1" stopColor="var(--accent-primary)" stopOpacity="0" />
          </linearGradient>
          <filter id="home-wave-blur" x="-5%" y="-50%" width="110%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>
        <g fill="none" stroke="url(#home-wave-a)" strokeLinecap="round">
          <path d="M-40 250 C 260 120, 520 300, 800 215 S 1340 90, 1640 215" strokeWidth="26" filter="url(#home-wave-blur)" opacity="0.7" />
          <path d="M-40 250 C 260 120, 520 300, 800 215 S 1340 90, 1640 215" strokeWidth="1.8" opacity="1" />
          <path d="M-40 285 C 300 200, 560 330, 860 255 S 1360 170, 1640 250" strokeWidth="1.2" opacity="0.65" />
          <path d="M-40 215 C 240 90, 500 240, 760 180 S 1300 60, 1640 175" strokeWidth="0.9" opacity="0.35" />
        </g>
      </svg>
    </div>
  )
}
