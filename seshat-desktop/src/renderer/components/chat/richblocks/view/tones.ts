export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export const TONE_BOX: Record<Tone, string> = {
  neutral: 'border-app-border-subtle bg-app-surface',
  info: 'border-app-info/40 bg-app-info/10',
  success: 'border-app-success/40 bg-app-success/10',
  warning: 'border-app-warning/40 bg-app-warning/10',
  danger: 'border-app-error/40 bg-app-error/10'
}

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-app-text-secondary',
  info: 'text-app-info',
  success: 'text-app-success',
  warning: 'text-app-warning',
  danger: 'text-app-error'
}

export function toneOf(value: unknown): Tone {
  return typeof value === 'string' && value in TONE_BOX ? (value as Tone) : 'neutral'
}
