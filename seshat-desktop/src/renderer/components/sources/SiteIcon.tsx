import { useState } from 'react'

// The logo of a site, from its domain; the first letter of its name when there is none.
export function SiteIcon({ domain, fallback, size = 18 }: { domain: string; fallback: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const box = 'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full'
  if (!domain || failed) {
    return (
      <span className={`${box} bg-[color-mix(in_srgb,var(--accent-primary)_88%,black)] font-bold text-white`} style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size / 2)) }}>
        {fallback}
      </span>
    )
  }
  return (
    <span className={`${box} bg-[color-mix(in_srgb,var(--surface-panel)_74%,var(--surface-root))]`} style={{ width: size, height: size }} aria-hidden="true">
      <img
        className="block size-full object-cover"
        src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  )
}
