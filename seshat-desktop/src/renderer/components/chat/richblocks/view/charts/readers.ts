import { isNode } from '../../lang/parseUi'

export type SeriesData = { name: string; values: number[]; tone?: string }
export type PointsData = { name: string; points: Array<[number, number]>; tone?: string; line: boolean }

export const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
export const numbers = (value: unknown): number[] => (Array.isArray(value) ? value.map(Number) : [])
export const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined)
export const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

export function readSeries(value: unknown): SeriesData[] {
  if (!Array.isArray(value)) return []
  return value.filter(isNode).map((node) => ({ name: String(node.props.name), values: numbers(node.props.values), tone: text(node.props.tone) }))
}

export function readPoints(value: unknown): PointsData[] {
  if (!Array.isArray(value)) return []
  return value.filter(isNode).map((node) => ({
    name: String(node.props.name),
    points: (Array.isArray(node.props.points) ? node.props.points : [])
      .map((pair): [number, number] => [Number((pair as unknown[])[0]), Number((pair as unknown[])[1])])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
    tone: text(node.props.tone),
    line: node.props.line === true
  }))
}

/** A value with its unit: 12.5 and "%" give "12.5%", 3 and "km" give "3 km" (a space only before a unit that starts with a letter). */
export function withUnit(value: number, unit?: string): string {
  const shown = Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(5)))
  return unit ? `${shown}${/^[A-Za-z]/.test(unit) ? ' ' : ''}${unit}` : shown
}
