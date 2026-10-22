import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The installer shows build/license.txt on its licence page: it must be the LICENSE of the repository, not an older copy.
describe('installer licence page', () => {
  it('shows the licence of the repository', () => {
    const desktop = join(__dirname, '..', '..')
    const read = (path: string) => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n').trim()
    expect(read(join(desktop, 'build', 'license.txt'))).toBe(read(join(desktop, '..', 'LICENSE')))
  })
})
