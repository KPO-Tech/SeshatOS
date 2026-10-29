import { describe, expect, it } from 'vitest'
import { parseUi } from '../../lang/parseUi'
import { breakoutExtra, wantsWidth } from './chatBreakout'

describe('breakoutExtra', () => {
  it('is zero when the column fills the conversation', () => {
    expect(breakoutExtra(800, 800)).toBe(0)
    expect(breakoutExtra(700, 800)).toBe(0)
  })

  it('leaves a gutter at each side', () => {
    expect(breakoutExtra(900, 800)).toBe(34)
  })

  it('is capped, however wide the conversation is', () => {
    expect(breakoutExtra(2400, 768)).toBe(180)
  })

  it('is zero when the room is smaller than the gutter', () => {
    expect(breakoutExtra(820, 800)).toBe(0)
  })
})

describe('wantsWidth', () => {
  const root = (src: string) => parseUi(src, { streaming: false }).root

  it('is true for a table and for an architecture, nested or not', () => {
    expect(wantsWidth(root('root = Table([Col("A")], [["x"]])'))).toBe(true)
    expect(wantsWidth(root('root = Architecture([Panel([Item("a")])])'))).toBe(true)
    expect(wantsWidth(root('root = Stack([Heading("t", 2), Card([Table([Col("A")], [["x"]])])])'))).toBe(true)
  })

  it('is false for blocks that read as well at the width of the text', () => {
    expect(wantsWidth(root('root = Callout("info", "Note")'))).toBe(false)
    expect(wantsWidth(root('root = Steps([Step("a"), Step("b")])'))).toBe(false)
    expect(wantsWidth(root('root = Stack([Heading("t", 2), MetricRow([Metric("A", 1)])])'))).toBe(false)
  })

  it('is false for nothing', () => {
    expect(wantsWidth(null)).toBe(false)
  })
})
