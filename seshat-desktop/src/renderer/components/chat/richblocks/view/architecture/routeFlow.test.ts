import { describe, expect, it } from 'vitest'
import { routeFlow, type Rect } from './routeFlow'

const box = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h })

describe('routeFlow', () => {
  it('is a straight vertical line between boxes one above the other', () => {
    const route = routeFlow(box(0, 0), box(20, 200))
    expect(route?.points).toEqual([{ x: 60, y: 60 }, { x: 60, y: 200 }])
    expect(route?.label).toEqual({ x: 60, y: 130 })
  })

  it('runs from the lower box up when the first one is below', () => {
    const route = routeFlow(box(0, 200), box(0, 0))
    expect(route?.points).toEqual([{ x: 50, y: 200 }, { x: 50, y: 60 }])
  })

  it('is a straight horizontal line between boxes side by side', () => {
    const route = routeFlow(box(0, 0), box(300, 10))
    expect(route?.points).toEqual([{ x: 100, y: 35 }, { x: 300, y: 35 }])
  })

  it('runs from the right box to the left one when the first is on the right', () => {
    const route = routeFlow(box(300, 0), box(0, 0))
    expect(route?.points).toEqual([{ x: 300, y: 30 }, { x: 100, y: 30 }])
  })

  it('bends once when the boxes share no axis, below', () => {
    const route = routeFlow(box(0, 0), box(300, 200))
    expect(route?.points).toEqual([{ x: 50, y: 60 }, { x: 50, y: 130 }, { x: 350, y: 130 }, { x: 350, y: 200 }])
    expect(route?.label).toEqual({ x: 200, y: 130 })
  })

  it('bends once when the boxes share no axis, above', () => {
    const route = routeFlow(box(300, 200), box(0, 0))
    expect(route?.points[0]).toEqual({ x: 350, y: 200 })
    expect(route?.points[3]).toEqual({ x: 50, y: 60 })
  })

  it('goes sideways with an elbow when the boxes barely overlap in height', () => {
    const route = routeFlow(box(0, 0), box(300, 50))
    expect(route?.points).toEqual([{ x: 100, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 80 }, { x: 300, y: 80 }])
  })

  it('draws nothing when a box holds the other, or they touch', () => {
    expect(routeFlow(box(0, 0, 400, 400), box(50, 50))).toBeNull()
    expect(routeFlow(box(50, 50), box(0, 0, 400, 400))).toBeNull()
    expect(routeFlow(box(0, 0), box(100, 0))).not.toBeNull()
    expect(routeFlow(box(0, 0), box(50, 30))).toBeNull()
  })
})
