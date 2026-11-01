import { describe, expect, it } from 'vitest'
import { shortDetail } from './taskView'

describe('shortDetail', () => {
  it('shortens what git prints while it downloads', () => {
    expect(shortDetail('Receiving objects: 65% (1807/2780), 104.61 MiB | 2.15 MiB/s')).toBe('RO 65% · 2.15 MiB/s')
    expect(shortDetail('Receiving objects:   3% (118/3493)')).toBe('RO 3%')
    expect(shortDetail('Updating files: 65% (1807/2780)')).toBe('UF 65%')
    expect(shortDetail('Resolving deltas: 100% (12/12), done.')).toBe('RD 100%')
  })

  it('leaves any other line alone', () => {
    expect(shortDetail('Collecting numpy')).toBe('Collecting numpy')
  })
})
