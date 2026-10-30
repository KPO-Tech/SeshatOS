import { toneOrNull, TONES, type Tone } from '../tones'

// The order the series of a chart take their colours in when none is given: well apart on a light and on a dark page.
const SEQUENCE: Tone[] = ['blue', 'orange', 'green', 'violet', 'red', 'teal', 'yellow']

/** The tone of the series at `index`: the one it asks for, or the next of the sequence. */
export function seriesTone(index: number, asked?: unknown): Tone {
  return toneOrNull(asked) ?? SEQUENCE[index % SEQUENCE.length]
}

/** The class that gives an SVG element the colour of a tone, through currentColor. */
export function seriesAccent(index: number, asked?: unknown): string {
  return TONES[seriesTone(index, asked)].accent
}
