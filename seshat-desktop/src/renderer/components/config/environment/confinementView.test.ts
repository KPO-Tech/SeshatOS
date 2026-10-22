import { describe, expect, it } from 'vitest'
import { confinementView, WINDOWS_SETUP_COMMAND } from './confinementView'

const status = (state: SrtStatus['state']): SrtStatus => ({ state, platform: 'win32' })

describe('confinementView', () => {
  it('never shows a confined state for a host where commands run with full rights', () => {
    expect(confinementView(status('needs-setup'), false).confined).toBe(false)
    expect(confinementView(status('unavailable'), false).confined).toBe(false)
    expect(confinementView(null, false).confined).toBe(false)
  })

  it('shows confined for srt, Landlock and Docker', () => {
    expect(confinementView(status('ready'), false).confined).toBe(true)
    expect(confinementView(status('not-needed'), false).confined).toBe(true)
    expect(confinementView(null, true).confined).toBe(true)
  })

  it('says it has not checked rather than guess when nothing is known yet', () => {
    const view = confinementView(null, false)
    expect(view.label).toBe('Not checked')
    expect(view.confined).toBe(false)
  })

  it('tells Windows users the command to run themselves and never sets it up on its own', () => {
    expect(confinementView(status('needs-setup'), false).text).toContain(WINDOWS_SETUP_COMMAND)
    expect(confinementView(status('needs-setup'), false).text).toContain('alpha')
  })
})
