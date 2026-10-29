import type { Formula } from './expression'

export type Sample = { x: number; y: number }

/** `n` evenly spaced values of a formula over [xmin, xmax]. A value is NaN or infinite where the formula is not defined. */
export function sampleFormula(formula: Formula, xmin: number, xmax: number, n: number): Sample[] {
  const count = Math.max(2, Math.floor(n))
  const samples: Sample[] = []
  for (let i = 0; i < count; i++) {
    const x = xmin + ((xmax - xmin) * i) / (count - 1)
    samples.push({ x, y: formula(x) })
  }
  return samples
}

/** The derivative of a formula, by a central difference: close enough to draw, and right whatever the formula is. */
export function derivativeOf(formula: Formula): Formula {
  return (x) => {
    const h = 1e-5 * (1 + Math.abs(x))
    return (formula(x + h) - formula(x - h)) / (2 * h)
  }
}

/**
 * The antiderivative that is zero at xmin, by the trapezoid rule. Where the formula is not defined the running total is kept
 * and the value is NaN, so the curve breaks there and goes on after.
 */
export function integralSamples(formula: Formula, xmin: number, xmax: number, n: number): Sample[] {
  const base = sampleFormula(formula, xmin, xmax, n)
  const out: Sample[] = []
  let total = 0
  for (let i = 0; i < base.length; i++) {
    const here = base[i]
    if (!Number.isFinite(here.y)) {
      out.push({ x: here.x, y: NaN })
      continue
    }
    const before = i > 0 ? base[i - 1] : null
    if (before && Number.isFinite(before.y)) total += ((before.y + here.y) / 2) * (here.x - before.x)
    out.push({ x: here.x, y: total })
  }
  return out
}

/** The integral of a formula between two bounds, by Simpson's rule. NaN when the formula is not defined on the way. */
export function simpson(formula: Formula, a: number, b: number, intervals = 600): number {
  const n = intervals % 2 === 0 ? intervals : intervals + 1
  const h = (b - a) / n
  let sum = formula(a) + formula(b)
  for (let i = 1; i < n; i++) sum += formula(a + i * h) * (i % 2 === 0 ? 2 : 4)
  return (sum * h) / 3
}

function quantile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

/**
 * The vertical range that shows a set of curves: all of it, a little padded; but when a few values run far off (the sides of a
 * tangent, 1/x near zero) the range is that of the bulk, so the interesting part is not flattened.
 */
export function autoRange(curves: Sample[][]): [number, number] {
  const values = curves.flatMap((curve) => curve.map((sample) => sample.y)).filter(Number.isFinite)
  if (values.length === 0) return [-1, 1]
  const sorted = [...values].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const low = quantile(sorted, 0.02)
  const high = quantile(sorted, 0.98)
  const bulk = high - low
  const wild = bulk > 0 ? max - min > 6 * bulk : max - min > 0
  const [from, to] = wild ? [low - bulk * 0.25, high + bulk * 0.25] : [min, max]
  const pad = (to - from) * 0.06 || 1
  return [from - pad, to + pad]
}

/**
 * Cuts a curve into the runs that are drawn as one line: at a value that is not a number, outside the range by far, or after a
 * jump too big to be the curve (an asymptote), so no line is drawn across a gap.
 */
export function drawableRuns(samples: Sample[], range: [number, number]): Sample[][] {
  const height = range[1] - range[0]
  const limit = height * 3
  const runs: Sample[][] = []
  let run: Sample[] = []
  const flush = () => {
    if (run.length > 1) runs.push(run)
    run = []
  }
  for (const sample of samples) {
    const usable = Number.isFinite(sample.y) && sample.y > range[0] - limit && sample.y < range[1] + limit
    if (!usable) {
      flush()
      continue
    }
    const previous = run[run.length - 1]
    if (previous && Math.abs(sample.y - previous.y) > height * 1.2) flush()
    run.push(sample)
  }
  flush()
  return runs
}
