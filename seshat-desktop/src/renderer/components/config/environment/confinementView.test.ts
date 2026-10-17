import { describe, expect, it } from 'vitest'
import { confinementView } from './confinementView'

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

  it('offers the setup only when it is what is missing', () => {
    expect(confinementView(status('needs-setup'), false).canEnable).toBe(true)
    expect(confinementView(status('unavailable'), false).canEnable).toBe(false)
    expect(confinementView(status('ready'), false).canEnable).toBe(false)
  })
})
