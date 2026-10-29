import { resolveIcon } from './iconCatalog'

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
  const icon = resolveIcon(name)
  if (!icon) return null
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
