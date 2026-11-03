import { describe, expect, it } from 'vitest'
import { confinementView } from './confinementView'

describe('confinementView', () => {
  it('never shows a confined state for a host where commands run with full rights', () => {
    const view = confinementView('local', false)
    expect(view.confined).toBe(false)
    expect(view.label).toBe('Not confined')
  })

  it('shows Landlock in direct mode where the kernel confines commands', () => {
    expect(confinementView('local', true)).toMatchObject({ label: 'Landlock', confined: true })
  })

  it('says what the project sandbox leaves open, so a lock does not promise more than it does', () => {
    const view = confinementView('project', false)
    expect(view.confined).toBe(true)
    expect(view.text).toContain('network')
    expect(view.text).toContain('other files')
    expect(view.text).toContain('not confined')
  })
})
