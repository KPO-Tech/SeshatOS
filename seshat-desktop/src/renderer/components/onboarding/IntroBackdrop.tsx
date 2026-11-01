/**
 * Soft ribbons of the accent colour behind the first screens: drawn here, so they follow the theme and the accent that are chosen on the
 * page itself, and nothing has to be shipped as a picture.
 */
export function IntroBackdrop() {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="intro-ribbon-a" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.9" />
          <stop offset="55%" stopColor="var(--accent-primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="intro-ribbon-b" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#c026d3" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.15" />
        </linearGradient>
        <filter id="intro-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <g opacity="var(--intro-ribbon-opacity, 0.55)" fill="none" strokeLinecap="round">
        <path d="M-120 520 C 140 360, 260 180, 520 40" stroke="url(#intro-ribbon-a)" strokeWidth="46" filter="url(#intro-soft)" />
        <path d="M-160 600 C 120 470, 300 260, 600 90" stroke="url(#intro-ribbon-a)" strokeWidth="9" />
        <path d="M-160 650 C 150 540, 340 330, 640 150" stroke="url(#intro-ribbon-a)" strokeWidth="3" opacity="0.7" />
        <path d="M1720 880 C 1400 800, 1250 640, 1000 560" stroke="url(#intro-ribbon-b)" strokeWidth="54" filter="url(#intro-soft)" />
        <path d="M1740 790 C 1430 720, 1280 560, 1040 520" stroke="url(#intro-ribbon-b)" strokeWidth="10" />
        <path d="M1740 720 C 1460 660, 1320 520, 1100 500" stroke="url(#intro-ribbon-b)" strokeWidth="3" opacity="0.7" />
        <path d="M1700 260 C 1500 300, 1380 200, 1180 120" stroke="url(#intro-ribbon-a)" strokeWidth="26" filter="url(#intro-soft)" opacity="0.7" />
      </g>
    </svg>
  )
}
