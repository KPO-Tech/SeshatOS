import { describe, expect, it } from 'vitest'
import { chooseRoute, countHits, countOverlaps, labelSize, lineBoxes, placeLabel } from './avoidRoute'
import { routeFlow, type Rect } from './routeFlow'

const box = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h })

describe('countHits', () => {
  it('counts the boxes a path goes through, each once', () => {
    const path = [{ x: 0, y: 30 }, { x: 500, y: 30 }]
    expect(countHits(path, [box(100, 0), box(300, 0), box(100, 200)])).toBe(2)
  })

  it('does not count a box the path only touches along an edge', () => {
    expect(countHits([{ x: 0, y: 60 }, { x: 500, y: 60 }], [box(100, 0)])).toBe(0)
  })
})

describe('chooseRoute', () => {
  it('keeps the plain route when nothing is in the way', () => {
    const a = box(0, 0)
    const b = box(20, 200)
    expect(chooseRoute(a, b, [])?.points).toEqual(routeFlow(a, b)?.points)
  })

  it('keeps the plain route when it hits as few boxes as any other', () => {
    const a = box(0, 0)
    const b = box(300, 200)
    const route = chooseRoute(a, b, [])
    expect(route?.points).toEqual(routeFlow(a, b)?.points)
    expect(route?.hits).toBe(0)
  })

  it('goes around a box that stands between two others', () => {
    const a = box(0, 0)
    const b = box(400, 0)
    const between = box(200, 10, 100, 40)
    const direct = routeFlow(a, b)
    expect(countHits(direct?.points ?? [], [between])).toBe(1)

    const route = chooseRoute(a, b, [between])
    expect(route?.hits).toBe(0)
    expect(countHits(route?.points ?? [], [between])).toBe(0)
  })

  it('goes around the title of a panel that lies across the straight line', () => {
    const a = box(0, 300, 100, 60)
    const b = box(0, 0, 100, 60)
    const title = box(-20, 150, 160, 30)
    const route = chooseRoute(a, b, [title])
    expect(route?.hits).toBe(0)
  })

  it('draws nothing when one box holds the other', () => {
    expect(chooseRoute(box(0, 0, 400, 400), box(50, 50), [])).toBeNull()
  })

  it('reports the hits that remain when there is no way around', () => {
    const a = box(0, 0)
    const b = box(300, 0)
    const wall = [box(-50, -300, 20, 700), box(400, -300, 20, 700), box(-50, -300, 520, 20), box(-50, 380, 520, 20), box(150, -300, 40, 700)]
    expect(chooseRoute(a, b, wall)?.hits).toBeGreaterThan(0)
  })
})

describe('placeLabel', () => {
  const size = labelSize('flow')
  const path = [{ x: 0, y: 100 }, { x: 400, y: 100 }]

  it('is the middle of the path when nothing is in the way', () => {
    expect(placeLabel(path, size, [], [])).toEqual({ x: 200, y: 100 })
  })

  it('moves along the path to leave a box uncovered', () => {
    const at = placeLabel(path, size, [box(150, 80, 100, 40)], [])
    expect(at.y).toBe(100)
    expect(at.x).not.toBe(200)
    const covered = at.x + size.w / 2 > 150 && at.x - size.w / 2 < 250
    expect(covered).toBe(false)
  })

  it('does not sit on a label already placed', () => {
    const first = placeLabel(path, size, [], [])
    const second = placeLabel(path, size, [], [{ x: first.x - size.w / 2, y: first.y - size.h / 2, w: size.w, h: size.h }])
    expect(second).not.toEqual(first)
  })

  it('takes the middle, which is the nearest, when everything around the path is covered alike', () => {
    expect(placeLabel(path, size, [box(-10, 0, 500, 300)], [])).toEqual({ x: 200, y: 100 })
  })

  it('moves clear of a band of boxes when it can, rather than sit on the path', () => {
    const at = placeLabel(path, size, [box(-10, 50, 500, 100)], [])
    expect(at.y - size.h / 2 >= 150 || at.y + size.h / 2 <= 50).toBe(true)
  })
})

describe('labelSize', () => {
  it('grows with the text and never goes below a minimum', () => {
    expect(labelSize('a').w).toBe(28)
    expect(labelSize('a long label of text').w).toBeGreaterThan(labelSize('short').w)
  })
})

describe('countOverlaps', () => {
  it('counts a segment that runs along one already drawn, on the same line', () => {
    expect(countOverlaps([{ x: 50, y: 0 }, { x: 50, y: 100 }], [[{ x: 50, y: 40 }, { x: 50, y: 300 }]])).toBe(1)
    expect(countOverlaps([{ x: 0, y: 20 }, { x: 200, y: 20 }], [[{ x: 100, y: 20 }, { x: 400, y: 20 }]])).toBe(1)
  })

  it('does not count lines that only cross, touch or run side by side', () => {
    expect(countOverlaps([{ x: 50, y: 0 }, { x: 50, y: 100 }], [[{ x: 0, y: 50 }, { x: 100, y: 50 }]])).toBe(0)
    expect(countOverlaps([{ x: 50, y: 0 }, { x: 50, y: 100 }], [[{ x: 50, y: 100 }, { x: 50, y: 200 }]])).toBe(0)
    expect(countOverlaps([{ x: 50, y: 0 }, { x: 50, y: 100 }], [[{ x: 60, y: 0 }, { x: 60, y: 100 }]])).toBe(0)
  })
})

describe('chooseRoute and arrows already drawn', () => {
  it('takes another path rather than run along an arrow already drawn', () => {
    const a = box(0, 0)
    const b = box(20, 200)
    const plain = routeFlow(a, b)?.points ?? []
    const route = chooseRoute(a, b, [], [plain])
    expect(route?.overlaps).toBe(0)
    expect(route?.points).not.toEqual(plain)
  })
})

describe('lineBoxes', () => {
  it('makes one thin box per segment', () => {
    const boxes = lineBoxes([{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 60 }], 4)
    expect(boxes).toEqual([{ x: 8, y: 8, w: 104, h: 4 }, { x: 108, y: 8, w: 4, h: 54 }])
  })

  it('keeps a label off the line of another arrow', () => {
    const path = [{ x: 0, y: 100 }, { x: 400, y: 100 }]
    const size = labelSize('flow')
    const crossing = lineBoxes([{ x: 200, y: 0 }, { x: 200, y: 200 }])
    const at = placeLabel(path, size, crossing, [])
    expect(at.x - size.w / 2 > 202 || at.x + size.w / 2 < 198).toBe(true)
  })
})
