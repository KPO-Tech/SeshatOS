import { TONE_NAMES, type ToneName } from '../catalog/tones'

export type Tone = ToneName

type ToneStyle = {
  /** Border and fill of a box (a panel, a card, a note). */
  box: string
  /** A light fill, for a cell or a row. */
  soft: string
  /** A stronger fill, for a header cell or a section row. */
  strong: string
  /** The colour of an icon or a figure that carries the tone. */
  accent: string
}

// Every class is written out in full so that Tailwind finds it. The meanings use the app's own colours; the hues use the
// stock palette at low opacity, which reads on a light and on a dark page.
export const TONES: Record<Tone, ToneStyle> = {
  neutral: { box: 'border-app-border-subtle bg-app-surface', soft: 'bg-app-surface', strong: 'bg-app-surface-elevated', accent: 'text-app-text-secondary' },
  info: { box: 'border-app-info/40 bg-app-info/10', soft: 'bg-app-info/10', strong: 'bg-app-info/20', accent: 'text-app-info' },
  success: { box: 'border-app-success/40 bg-app-success/10', soft: 'bg-app-success/10', strong: 'bg-app-success/20', accent: 'text-app-success' },
  warning: { box: 'border-app-warning/40 bg-app-warning/10', soft: 'bg-app-warning/10', strong: 'bg-app-warning/20', accent: 'text-app-warning' },
  danger: { box: 'border-app-error/40 bg-app-error/10', soft: 'bg-app-error/10', strong: 'bg-app-error/20', accent: 'text-app-error' },
  blue: { box: 'border-blue-500/35 bg-blue-500/10', soft: 'bg-blue-500/10', strong: 'bg-blue-500/20', accent: 'text-blue-500' },
  violet: { box: 'border-violet-500/35 bg-violet-500/10', soft: 'bg-violet-500/10', strong: 'bg-violet-500/20', accent: 'text-violet-500' },
  green: { box: 'border-emerald-500/35 bg-emerald-500/10', soft: 'bg-emerald-500/10', strong: 'bg-emerald-500/20', accent: 'text-emerald-500' },
  orange: { box: 'border-orange-500/35 bg-orange-500/10', soft: 'bg-orange-500/10', strong: 'bg-orange-500/20', accent: 'text-orange-500' },
  red: { box: 'border-rose-500/35 bg-rose-500/10', soft: 'bg-rose-500/10', strong: 'bg-rose-500/20', accent: 'text-rose-500' },
  teal: { box: 'border-teal-500/35 bg-teal-500/10', soft: 'bg-teal-500/10', strong: 'bg-teal-500/20', accent: 'text-teal-500' },
  yellow: { box: 'border-amber-500/35 bg-amber-500/10', soft: 'bg-amber-500/10', strong: 'bg-amber-500/20', accent: 'text-amber-500' }
}

/** The tone a value names, or null when it names none: a component then keeps its own look. */
export function toneOrNull(value: unknown): Tone | null {
  return typeof value === 'string' && (TONE_NAMES as readonly string[]).includes(value) ? (value as Tone) : null
}

export function toneOf(value: unknown): Tone {
  return toneOrNull(value) ?? 'neutral'
}

export const TONE_BOX = Object.fromEntries(TONE_NAMES.map((name) => [name, TONES[name].box])) as Record<Tone, string>
export const TONE_TEXT = Object.fromEntries(TONE_NAMES.map((name) => [name, TONES[name].accent])) as Record<Tone, string>
