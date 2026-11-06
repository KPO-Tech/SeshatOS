import { useEffect, useState } from 'react'
import { loadLogo, peekLogo, resolveIcon, type ResolvedIcon } from './iconCatalog'

type Props = { name: string | undefined; size?: number; className?: string }

/** Brand colours that would vanish on a light or a dark page are drawn in the text colour instead. */
function readableOnBoth(hex: string): boolean {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.22 && luminance < 0.8
}

export function RichIcon({ name, size = 16, className }: Props) {
  const known = resolveIcon(name)
  // A name the lists do not hold may be a logo of the larger set: it is read when first asked for, and drawn when it arrives.
  const [loaded, setLoaded] = useState<ResolvedIcon | null>(() => (known ? null : peekLogo(name) ?? null))
  useEffect(() => {
    if (known || !name) {
      setLoaded(null)
      return
    }
    let live = true
    void loadLogo(name).then((icon) => {
      if (live) setLoaded(icon)
    })
    return () => {
      live = false
    }
  }, [known, name])
  const icon = known ?? loaded
  if (!icon) return null
  if (icon.kind === 'logo') {
    return (
      <span className={`inline-flex shrink-0 ${className ?? ''}`} aria-hidden="true">
        <svg viewBox={`0 0 ${icon.width} ${icon.height}`} width={Math.min(size * 3, Math.round(size * (icon.width / icon.height)))} height={size} fill="currentColor" dangerouslySetInnerHTML={{ __html: icon.body }} />
      </span>
    )
  }
  if (icon.kind === 'generic') {
    const Generic = icon.component
    return (
      <span className={`inline-flex shrink-0 ${className ?? ''}`} aria-hidden="true">
        <Generic size={size} fill="currentColor" strokeWidth={3} />
      </span>
    )
  }
  const color = readableOnBoth(icon.icon.hex) ? `#${icon.icon.hex}` : 'currentColor'
  return (
    <span className={`inline-flex shrink-0 ${className ?? ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
        <path d={icon.icon.path} />
      </svg>
    </span>
  )
}
