import { BRAND_ICONS } from './brandIcons'

// Relative luminance of a "RRGGBB" hex, 0 (black) to 1 (white).
export function hexLuminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

type Props = {
  brand?: string
  title: string
  size?: number
}

// A vendor mark on a neutral tile. Near-black marks (Notion, GitHub) would
// vanish in the dark theme, so they take the text color instead of their own.
export function BrandIcon({ brand, title, size = 40 }: Props) {
  const icon = brand ? BRAND_ICONS[brand] : undefined
  const glyph = Math.round(size * 0.55)

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-primary)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {icon ? (
        <svg viewBox="0 0 24 24" width={glyph} height={glyph} fill={hexLuminance(icon.hex) < 0.2 ? 'currentColor' : `#${icon.hex}`}>
          <path d={icon.path} />
        </svg>
      ) : (
        <span className="font-semibold text-[var(--text-secondary)]" style={{ fontSize: Math.round(size * 0.42) }}>
          {title.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  )
}
