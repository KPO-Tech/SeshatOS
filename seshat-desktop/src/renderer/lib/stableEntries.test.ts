import { describe, expect, it } from 'vitest'
import { stabilizeEntries } from './stableEntries'

describe('stabilizeEntries', () => {
  it('keeps a list identical while its content does not change', () => {
    const first = stabilizeEntries(new Map([[3, [{ path: 'a.html' }]], [7, [{ path: 'b.py' }]]]), new Map())
    const second = stabilizeEntries(new Map([[3, [{ path: 'a.html' }]], [7, [{ path: 'b.py' }, { path: 'c.py' }]]]), first.kept)
    expect(second.out.get(3)).toBe(first.out.get(3))
    expect(second.out.get(7)).not.toBe(first.out.get(7))
    expect(second.out.get(7)).toHaveLength(2)
  })

  it('forgets a list that is gone', () => {
    const first = stabilizeEntries(new Map([[3, ['x']]]), new Map())
    const second = stabilizeEntries(new Map<number, string[]>(), first.kept)
    expect(second.kept.size).toBe(0)
  })
})
