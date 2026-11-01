import { describe, expect, it } from 'vitest'
import { withBackendLibraries } from './backend-env'

describe('withBackendLibraries', () => {
  it('puts the backend folder first on the Linux library path, keeping what was there', () => {
    expect(withBackendLibraries({ LD_LIBRARY_PATH: '/opt/lib' }, '/app/backend', 'linux').LD_LIBRARY_PATH).toBe('/app/backend:/opt/lib')
    expect(withBackendLibraries({}, '/app/backend', 'linux').LD_LIBRARY_PATH).toBe('/app/backend')
  })

  it('does the same on macOS with its own variable', () => {
    expect(withBackendLibraries({ DYLD_LIBRARY_PATH: '/opt/lib' }, '/app/backend', 'darwin').DYLD_LIBRARY_PATH).toBe('/app/backend:/opt/lib')
  })

  it('puts the folder first on the Windows PATH', () => {
    expect(withBackendLibraries({ PATH: 'C:/Windows' }, 'C:/app/backend', 'win32').PATH).toBe('C:/app/backend;C:/Windows')
  })

  it('keeps the Windows search path when it is spelled Path, as for an app started from Explorer', () => {
    const env = withBackendLibraries({ Path: 'C:/Program Files/Git/cmd' }, 'C:/app/backend', 'win32')
    expect(Object.keys(env).filter((key) => key.toUpperCase() === 'PATH')).toEqual(['PATH'])
    expect(env.PATH).toBe('C:/app/backend;C:/Program Files/Git/cmd')
  })

  it('leaves the environment it was given untouched', () => {
    const env = { LD_LIBRARY_PATH: '/opt/lib' }
    withBackendLibraries(env, '/app/backend', 'linux')
    expect(env.LD_LIBRARY_PATH).toBe('/opt/lib')
  })
})
