export type Rect = { x: number; y: number; w: number; h: number }
export type Point = { x: number; y: number }
export type Route = { points: Point[]; label: Point }

/** Two boxes must share this much of an axis for the arrow between them to be a straight line. */
const MIN_OVERLAP = 24

const right = (r: Rect) => r.x + r.w
const bottom = (r: Rect) => r.y + r.h

export function middlePoint(points: Point[]): Point {
  const i = Math.floor((points.length - 1) / 2)
  return { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
}

/**
 * An orthogonal path from the edge of one box to the edge of another: straight when they overlap on one axis, with one
 * elbow otherwise. It is null when the boxes touch or one holds the other, where an arrow would mean nothing.
 */
export function routeFlow(a: Rect, b: Rect): Route | null {
  const apart = right(a) <= b.x || right(b) <= a.x || bottom(a) <= b.y || bottom(b) <= a.y
  if (!apart) return null

  const aAbove = bottom(a) <= b.y
  const bAbove = bottom(b) <= a.y
  const aLeft = right(a) <= b.x
  const bLeft = right(b) <= a.x
  const overlapX = Math.min(right(a), right(b)) - Math.max(a.x, b.x)
  const overlapY = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y)

  let points: Point[]
  if ((aAbove || bAbove) && overlapX >= MIN_OVERLAP) {
    const x = (Math.max(a.x, b.x) + Math.min(right(a), right(b))) / 2
    points = aAbove ? [{ x, y: bottom(a) }, { x, y: b.y }] : [{ x, y: a.y }, { x, y: bottom(b) }]
  } else if ((aLeft || bLeft) && overlapY >= MIN_OVERLAP) {
    const y = (Math.max(a.y, b.y) + Math.min(bottom(a), bottom(b))) / 2
    points = aLeft ? [{ x: right(a), y }, { x: b.x, y }] : [{ x: a.x, y }, { x: right(b), y }]
  } else if (aAbove || bAbove) {
    const ax = a.x + a.w / 2
    const bx = b.x + b.w / 2
    const from = aAbove ? bottom(a) : a.y
    const to = aAbove ? b.y : bottom(b)
    const mid = (from + to) / 2
    points = [{ x: ax, y: from }, { x: ax, y: mid }, { x: bx, y: mid }, { x: bx, y: to }]
  } else {
    const ay = a.y + a.h / 2
    const by = b.y + b.h / 2
    const from = aLeft ? right(a) : a.x
    const to = aLeft ? b.x : right(b)
    const mid = (from + to) / 2
    points = [{ x: from, y: ay }, { x: mid, y: ay }, { x: mid, y: by }, { x: to, y: by }]
  }
  return { points, label: middlePoint(points) }
}
