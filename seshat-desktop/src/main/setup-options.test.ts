import { describe, expect, it } from 'vitest'
import { withInstalled } from './setup-options'

const options = [{ id: 'tiny' }, { id: 'base' }, { id: 'small' }]

describe('withInstalled', () => {
  it('marks the options whose files are already there', () => {
    expect(withInstalled(options, ['base']).map((o) => [o.id, o.installed])).toEqual([['tiny', false], ['base', true], ['small', false]])
  })

  it('marks only an installed option as the one in use', () => {
    // The active model is named in the settings even when its file was deleted: it is not "in use" then.
    expect(withInstalled(options, ['base'], 'small').some((o) => o.active)).toBe(false)
    expect(withInstalled(options, ['tiny', 'base'], 'base').filter((o) => o.active).map((o) => o.id)).toEqual(['base'])
  })

  it('keeps what the options already say, and marks nothing on a computer with nothing', () => {
    const marked = withInstalled([{ id: 'a', label: 'A' }], [])
    expect(marked).toEqual([{ id: 'a', label: 'A', installed: false, active: false }])
  })
})
