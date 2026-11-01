import { isHexColor } from './customThemes'
import { parseHex } from './themes'

// The accent colour is a choice made on top of a theme: the colour of buttons, links, the selected item. A theme brings its own; this
// replaces it, whatever the theme, until the person goes back to the theme's own.

export type AccentChoice = { id: string; label: string; hex: string }

/** The colours offered, the first being the orange of Seshat. */
export const ACCENTS: ReadonlyArray<AccentChoice> = [
  { id: 'orange', label: 'Orange', hex: '#ef7c2f' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'purple', label: 'Purple', hex: '#8b5cf6' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
  { id: 'green', label: 'Green', hex: '#22a55b' },
  { id: 'teal', label: 'Teal', hex: '#14b8a6' }
]

const storageKey = 'seshat.accent'
const styleId = 'seshat-accent'

/** The CSS that puts an accent over the theme: the colour itself and the soft tint made from it. */
export function accentCss(hex: string): string {
  const [r, g, b] = parseHex(hex)
  return `html:root[data-accent] {\n  --accent-primary: ${hex};\n  --accent-subtle: rgba(${r}, ${g}, ${b}, 0.12);\n}`
}

/** The accent the person chose, or null when the theme's own is used. Anything stored that is not a six-digit colour is ignored. */
export function getStoredAccent(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(storageKey)
    return isHexColor(stored) ? stored.toLowerCase() : null
  } catch {
    return null
  }
}

/** Puts an accent over the theme, or removes it with null. */
export function applyAccent(hex: string | null) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  let style = document.getElementById(styleId)
  if (!hex || !isHexColor(hex)) {
    root.removeAttribute('data-accent')
    style?.remove()
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    document.head.appendChild(style)
  }
  style.textContent = accentCss(hex.toLowerCase())
  root.setAttribute('data-accent', 'custom')
}

/** Chooses an accent: remembered and applied. Null goes back to the theme's own. */
export function chooseAccent(hex: string | null) {
  if (typeof window !== 'undefined') {
    try {
      if (hex && isHexColor(hex)) window.localStorage.setItem(storageKey, hex.toLowerCase())
      else window.localStorage.removeItem(storageKey)
    } catch {
      // Not remembered, still applied.
    }
  }
  applyAccent(hex)
}
