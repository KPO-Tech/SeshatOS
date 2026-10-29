/** Round tick values over [min, max]: steps of 1, 2 or 5 times a power of ten, about `target` of them. */
export function niceTicks(min: number, max: number, target = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1
    return niceTicks(min - pad, max + pad, target)
  }
  const span = max - min
  const rough = span / Math.max(1, target)
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const residual = rough / magnitude
  const step = (residual >= 7 ? 10 : residual >= 3.5 ? 5 : residual >= 1.5 ? 2 : 1) * magnitude
  const ticks: number[] = []
  const last = Math.floor(max / step + 1e-9)
  // Each tick is a whole number of steps, so there is no drift and zero is exactly zero.
  for (let k = Math.ceil(min / step - 1e-9); k <= last; k++) ticks.push(Number((k * step).toPrecision(12)))
  return ticks
}

/** The ends of an axis that start and end on a tick, so the data never touches the frame. */
export function niceDomain(min: number, max: number, target = 6): [number, number] {
  const ticks = niceTicks(min, max, target)
  if (ticks.length < 2) return [min, max]
  const step = ticks[1] - ticks[0]
  const low = Number((Math.floor(min / step + 1e-9) * step).toPrecision(12))
  const high = Number((Math.ceil(max / step - 1e-9) * step).toPrecision(12))
  return [low, high]
}

export function formatTick(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e6 || abs < 1e-4) return value.toExponential(1).replace('.0e', 'e').replace('e+', 'e')
  return String(Number(value.toPrecision(6)))
}

export type Scale = ((value: number) => number) & { domain: [number, number]; range: [number, number] }

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale
  scale.domain = domain
  scale.range = range
  return scale
}
