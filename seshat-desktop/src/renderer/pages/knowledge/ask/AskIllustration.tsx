// The picture of the Ask screen, drawn here with the colors of the app: a card of text with the kinds of document floating around it.
// It is decoration, so it is hidden from assistive technology.
export function AskIllustration() {
  return (
    <svg viewBox="0 0 520 250" role="presentation" aria-hidden="true" className="h-auto w-full max-w-[520px]">
      <defs>
        <linearGradient id="ask-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--surface-panel)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--surface-panel) 70%, var(--accent-primary))" />
        </linearGradient>
        <filter id="ask-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* the dotted trail and the sparks */}
      <path d="M96 110 C 60 60, 120 28, 190 36" fill="none" stroke="var(--accent-primary)" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="2 5" />
      <path d="M430 42 C 480 52, 490 100, 468 130" fill="none" stroke="var(--accent-primary)" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="2 5" />
      {[
        [58, 150],
        [168, 214],
        [452, 196],
        [372, 24]
      ].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y - 5} L${x + 1.6} ${y - 1.6} L${x + 5} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 5} L${x - 1.6} ${y + 1.6} L${x - 5} ${y} L${x - 1.6} ${y - 1.6} Z`} fill="var(--accent-primary)" opacity="0.8" />
      ))}

      {/* the pages behind */}
      <rect x="150" y="42" width="74" height="92" rx="9" fill="var(--surface-hover)" stroke="var(--border-soft)" />
      <rect x="164" y="60" width="38" height="4" rx="2" fill="var(--text-muted)" opacity="0.5" />
      <rect x="164" y="72" width="46" height="4" rx="2" fill="var(--text-muted)" opacity="0.35" />
      <rect x="164" y="84" width="30" height="4" rx="2" fill="var(--text-muted)" opacity="0.35" />

      {/* the card of text, in front */}
      <g filter="url(#ask-shadow)">
        <rect x="170" y="62" width="196" height="132" rx="14" fill="url(#ask-card)" stroke="color-mix(in srgb, var(--accent-primary) 45%, var(--border-soft))" />
      </g>
      <rect x="190" y="84" width="104" height="9" rx="4.5" fill="var(--accent-primary)" />
      <rect x="190" y="104" width="148" height="6" rx="3" fill="var(--text-muted)" opacity="0.6" />
      <rect x="190" y="118" width="132" height="6" rx="3" fill="var(--text-muted)" opacity="0.45" />
      <rect x="190" y="132" width="146" height="6" rx="3" fill="var(--text-muted)" opacity="0.45" />
      <rect x="190" y="152" width="70" height="20" rx="10" fill="var(--accent-primary)" opacity="0.18" />
      <rect x="198" y="159" width="54" height="6" rx="3" fill="var(--accent-primary)" opacity="0.8" />

      {/* PDF */}
      <g filter="url(#ask-shadow)">
        <rect x="104" y="96" width="62" height="62" rx="12" fill="var(--surface-panel)" stroke="var(--border-soft)" />
      </g>
      <path d="M122 114 h16 l8 8 v22 h-24 z" fill="none" stroke="var(--accent-danger)" strokeWidth="2.4" strokeLinejoin="round" />
      <text x="135" y="140" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--accent-danger)">PDF</text>

      {/* Word */}
      <g filter="url(#ask-shadow)">
        <rect x="318" y="14" width="58" height="58" rx="12" fill="var(--accent-info)" />
      </g>
      <text x="347" y="52" textAnchor="middle" fontSize="26" fontWeight="700" fill="#fff">W</text>

      {/* Excel */}
      <g filter="url(#ask-shadow)">
        <rect x="378" y="92" width="58" height="58" rx="12" fill="var(--accent-success)" />
      </g>
      <text x="407" y="130" textAnchor="middle" fontSize="26" fontWeight="700" fill="#fff">X</text>

      {/* code */}
      <g filter="url(#ask-shadow)">
        <rect x="438" y="136" width="52" height="52" rx="11" fill="var(--surface-panel)" stroke="var(--border-soft)" />
      </g>
      <path d="M455 154 l-8 8 8 8 M473 154 l8 8 -8 8 M468 150 l-4 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* image */}
      <g filter="url(#ask-shadow)">
        <rect x="318" y="156" width="56" height="52" rx="11" fill="color-mix(in srgb, var(--accent-primary) 28%, var(--surface-panel))" stroke="var(--border-soft)" />
      </g>
      <circle cx="334" cy="172" r="4.5" fill="var(--text-primary)" opacity="0.8" />
      <path d="M326 198 l14 -14 10 10 8 -8 8 12 z" fill="var(--text-primary)" opacity="0.65" />
    </svg>
  )
}
