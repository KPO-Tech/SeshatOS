import { describe, expect, it } from 'vitest'
import { confinementView, WINDOWS_SETUP_COMMAND } from './confinementView'

const status = (state: SrtStatus['state']): SrtStatus => ({ state, platform: 'win32' })

describe('confinementView', () => {
  it('never shows a confined state for a host where commands run with full rights', () => {
    expect(confinementView(status('needs-setup'), 'local').confined).toBe(false)
    expect(confinementView(status('unavailable'), 'local').confined).toBe(false)
    expect(confinementView(null, 'local').confined).toBe(false)
  })

  it('shows confined for srt, Landlock and Docker', () => {
    expect(confinementView(status('ready'), 'local').confined).toBe(true)
    expect(confinementView(status('not-needed'), 'local').confined).toBe(true)
    expect(confinementView(null, 'docker').confined).toBe(true)
  })

  it('says what the project sandbox leaves open, so a lock does not promise more than it does', () => {
    const view = confinementView(null, 'project')
    expect(view.confined).toBe(true)
    expect(view.text).toContain('network')
    expect(view.text).toContain('other files')
    expect(view.text).toContain('not confined')
  })

  it('says it has not checked rather than guess when nothing is known yet', () => {
    const view = confinementView(null, 'local')
    expect(view.label).toBe('Not checked')
    expect(view.confined).toBe(false)
  })

  it('tells Windows users the command to run themselves and never sets it up on its own', () => {
    expect(confinementView(status('needs-setup'), 'local').text).toContain(WINDOWS_SETUP_COMMAND)
    expect(confinementView(status('needs-setup'), 'local').text).toContain('alpha')
  })
})
