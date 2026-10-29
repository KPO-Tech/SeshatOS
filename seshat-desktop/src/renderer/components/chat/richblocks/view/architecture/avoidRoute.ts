import { middlePoint, routeFlow, type Point, type Rect, type Route } from './routeFlow'

/** Boxes are shrunk by this much before a segment is tested against them, so that an arrow that starts on an edge does not hit its own box. */
const SHRINK = 2
/** How far a detour runs beyond the two boxes. */
const DETOUR = 18
const BEND_COST = 15

/** What a route costs: the boxes it goes through, the arrows it runs along, and its length. */
export type ScoredRoute = Route & { hits: number; overlaps: number; cost: number }

const HIT_WEIGHT = 1000
const OVERLAP_WEIGHT = 600
/** Two arrows that run along each other for less than this are not drawn on top of one another. */
const MIN_SHARED = 4

const right = (r: Rect) => r.x + r.w
const bottom = (r: Rect) => r.y + r.h

function shrunk(r: Rect): Rect {
  return { x: r.x + SHRINK, y: r.y + SHRINK, w: Math.max(0, r.w - 2 * SHRINK), h: Math.max(0, r.h - 2 * SHRINK) }
}

function segmentHits(p: Point, q: Point, r: Rect): boolean {
  if (r.w <= 0 || r.h <= 0) return false
  if (p.y === q.y) {
    const [x1, x2] = p.x < q.x ? [p.x, q.x] : [q.x, p.x]
    return p.y > r.y && p.y < bottom(r) && x2 > r.x && x1 < right(r)
  }
  if (p.x === q.x) {
    const [y1, y2] = p.y < q.y ? [p.y, q.y] : [q.y, p.y]
    return p.x > r.x && p.x < right(r) && y2 > r.y && y1 < bottom(r)
  }
  return false
}

/** How many of the boxes an orthogonal path goes through. */
export function countHits(points: Point[], boxes: Rect[]): number {
  let hits = 0
  for (const box of boxes) {
    for (let i = 0; i + 1 < points.length; i++) {
      if (segmentHits(points[i], points[i + 1], box)) {
        hits++
        break
      }
    }
  }
  return hits
}

/** How many segments of the path run along a segment of an arrow already drawn, on the same line. */
export function countOverlaps(points: Point[], used: Point[][]): number {
  let count = 0
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i]
    const q = points[i + 1]
    for (const other of used) {
      for (let j = 0; j + 1 < other.length; j++) {
        const r = other[j]
        const s = other[j + 1]
        if (p.y === q.y && r.y === s.y && Math.abs(p.y - r.y) < 1) {
          if (Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)) > MIN_SHARED) count++
        } else if (p.x === q.x && r.x === s.x && Math.abs(p.x - r.x) < 1) {
          if (Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)) > MIN_SHARED) count++
        }
      }
    }
  }
  return count
}

function withoutRepeats(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y)
}

function length(points: Point[]): number {
  let total = 0
  for (let i = 0; i + 1 < points.length; i++) total += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y)
  return total
}

/** Every orthogonal path worth trying between two boxes: elbows, steps, and detours that clear the boxes in the way too. */
function candidates(a: Rect, b: Rect, obstacles: Rect[]): Point[][] {
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const bx = b.x + b.w / 2
  const by = b.y + b.h / 2
  const bRight = bx > ax
  const bBelow = by > ay
  const aSideX = bRight ? right(a) : a.x
  const bSideX = bRight ? b.x : right(b)
  const aSideY = bBelow ? bottom(a) : a.y
  const bSideY = bBelow ? b.y : bottom(b)
  const midY = (aSideY + bSideY) / 2
  const midX = (aSideX + bSideX) / 2
  let top = Math.min(a.y, b.y) - DETOUR
  let floor = Math.max(bottom(a), bottom(b)) + DETOUR
  let left = Math.min(a.x, b.x) - DETOUR
  let edge = Math.max(right(a), right(b)) + DETOUR
  // A detour must clear what stands in the band it runs through, not only the two boxes.
  const bandY = { y: Math.min(a.y, b.y), h: Math.max(bottom(a), bottom(b)) - Math.min(a.y, b.y) }
  const bandX = { x: Math.min(a.x, b.x), w: Math.max(right(a), right(b)) - Math.min(a.x, b.x) }
  for (const o of obstacles) {
    if (o.y < bandY.y + bandY.h && bottom(o) > bandY.y) {
      left = Math.min(left, o.x - DETOUR)
      edge = Math.max(edge, right(o) + DETOUR)
    }
    if (o.x < bandX.x + bandX.w && right(o) > bandX.x) {
      top = Math.min(top, o.y - DETOUR)
      floor = Math.max(floor, bottom(o) + DETOUR)
    }
  }

  return [
    [{ x: ax, y: aSideY }, { x: ax, y: by }, { x: bSideX, y: by }],
    [{ x: aSideX, y: ay }, { x: bx, y: ay }, { x: bx, y: bSideY }],
    [{ x: ax, y: aSideY }, { x: ax, y: midY }, { x: bx, y: midY }, { x: bx, y: bSideY }],
    [{ x: aSideX, y: ay }, { x: midX, y: ay }, { x: midX, y: by }, { x: bSideX, y: by }],
    [{ x: ax, y: a.y }, { x: ax, y: top }, { x: bx, y: top }, { x: bx, y: b.y }],
    [{ x: ax, y: bottom(a) }, { x: ax, y: floor }, { x: bx, y: floor }, { x: bx, y: bottom(b) }],
    [{ x: a.x, y: ay }, { x: left, y: ay }, { x: left, y: by }, { x: b.x, y: by }],
    [{ x: right(a), y: ay }, { x: edge, y: ay }, { x: edge, y: by }, { x: right(b), y: by }]
  ]
}

/**
 * The path between two boxes that goes through the fewest of `obstacles` (the titles and the other items of the drawing).
 * The plain route comes first and is kept whenever nothing beats it, so a drawing with room to spare is routed as before.
 */
export function chooseRoute(a: Rect, b: Rect, obstacles: Rect[], used: Point[][] = []): ScoredRoute | null {
  const base = routeFlow(a, b)
  if (!base) return null
  const blockers = [...obstacles, shrunk(a), shrunk(b)]
  const scored = [base.points, ...candidates(a, b, obstacles)]
    .map(withoutRepeats)
    .filter((points) => points.length >= 2)
    .map((points) => {
      const hits = countHits(points, blockers)
      const overlaps = countOverlaps(points, used)
      return { points, hits, overlaps, bad: hits * HIT_WEIGHT + overlaps * OVERLAP_WEIGHT, cost: length(points) + (points.length - 2) * BEND_COST }
    })

  const least = Math.min(...scored.map((route) => route.bad))
  const pick = scored[0].bad === least ? scored[0] : scored.filter((route) => route.bad === least).sort((x, y) => x.cost - y.cost)[0]
  return { points: pick.points, label: middlePoint(pick.points), hits: pick.hits, overlaps: pick.overlaps, cost: pick.cost }
}

function pointAt(points: Point[], distance: number): { at: Point; horizontal: boolean } {
  let left = distance
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i]
    const q = points[i + 1]
    const segment = Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
    if (left <= segment) {
      const at = segment === 0 ? p : { x: p.x + ((q.x - p.x) * left) / segment, y: p.y + ((q.y - p.y) * left) / segment }
      return { at, horizontal: p.y === q.y }
    }
    left -= segment
  }
  const last = points[points.length - 1]
  return { at: last, horizontal: points.length < 2 || points[points.length - 2].y === last.y }
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(right(a), right(b)) - Math.max(a.x, b.x)
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

const LABEL_SPOTS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88]

/** How many label heights (or widths) beside the path a label may be moved when no spot on it is free. */
const SIDE_STEPS = 4

/**
 * Where to put the label of an arrow: on the path, at the first spot where it covers no box, no arrow and no other label; failing
 * that beside the path, a little further each time. When nothing is free it takes the spot it covers least, nearest the path.
 */
export function placeLabel(points: Point[], size: { w: number; h: number }, obstacles: Rect[], taken: Rect[]): Point {
  const total = length(points)
  let best: { at: Point; cost: number } | null = null
  for (let step = 0; step <= SIDE_STEPS; step++) {
    for (const sign of step === 0 ? [1] : [1, -1]) {
      for (const spot of LABEL_SPOTS) {
        const { at, horizontal } = pointAt(points, total * spot)
        const shift = sign * step * ((horizontal ? size.h : size.w) / 2 + 6)
        const candidate = horizontal ? { x: at.x, y: at.y + shift } : { x: at.x + shift, y: at.y }
        const box: Rect = { x: candidate.x - size.w / 2, y: candidate.y - size.h / 2, w: size.w, h: size.h }
        const covered = [...obstacles, ...taken].reduce((sum, other) => sum + overlapArea(box, other), 0)
        if (covered === 0) return candidate
        const cost = covered + Math.abs(shift) * 2 + Math.abs(spot - 0.5) * 20
        if (!best || cost < best.cost) best = { at: candidate, cost }
      }
    }
  }
  return best ? best.at : pointAt(points, total / 2).at
}

/** Each segment of a path as a thin box, so that a label can be kept off the lines of the other arrows. */
export function lineBoxes(points: Point[], thickness = 4): Rect[] {
  const boxes: Rect[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i]
    const q = points[i + 1]
    boxes.push({ x: Math.min(p.x, q.x) - thickness / 2, y: Math.min(p.y, q.y) - thickness / 2, w: Math.abs(q.x - p.x) + thickness, h: Math.abs(q.y - p.y) + thickness })
  }
  return boxes
}

/** The widest a label is drawn: a longer text wraps onto a second line. */
export const LABEL_MAX_WIDTH = 150

/** The box a label of this text takes, as it is drawn (a small text on a padded background). */
export function labelSize(text: string): { w: number; h: number } {
  const wide = text.length * 6.2 + 14
  const lines = Math.max(1, Math.ceil(wide / LABEL_MAX_WIDTH))
  return { w: Math.max(28, Math.min(wide, LABEL_MAX_WIDTH)), h: 6 + lines * 14 }
}
