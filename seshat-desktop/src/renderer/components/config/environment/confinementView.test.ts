import { beforeAll, describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { englishT } from '@renderer/i18n/testing'
import { confinementView } from './confinementView'

describe('confinementView', () => {
  let t: TFunction
  beforeAll(async () => {
    t = await englishT()
  })

  it('never shows a confined state for a host where commands run with full rights', () => {
    const view = confinementView('local', false, t)
    expect(view.confined).toBe(false)
    expect(view.label).toBe('Not confined')
  })

  it('shows Landlock in direct mode where the kernel confines commands', () => {
    expect(confinementView('local', true, t)).toMatchObject({ label: 'Landlock', confined: true })
  })

  it('says what the project sandbox leaves open, so a lock does not promise more than it does', () => {
    const view = confinementView('project', false, t)
    expect(view.confined).toBe(true)
    expect(view.text).toContain('network')
    expect(view.text).toContain('other files')
    expect(view.text).toContain('not confined')
  })
})
