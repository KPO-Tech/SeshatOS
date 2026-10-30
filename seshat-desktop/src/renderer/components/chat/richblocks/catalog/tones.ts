// The colours a component can take. The first five say what a thing means, the rest are plain hues, for marking a concept
// (a recommended option, a risk, a total) without saying what it is.
export const TONE_NAMES = [
  'neutral', 'info', 'success', 'warning', 'danger',
  'blue', 'violet', 'green', 'orange', 'red', 'teal', 'yellow'
] as const

export type ToneName = (typeof TONE_NAMES)[number]
