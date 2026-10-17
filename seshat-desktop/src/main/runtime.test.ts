import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '.' } }))

import { desktopBridgeProof } from './runtime'

// The same vector is checked by the Go backend (desktop_bridge_test.go): the two sides must agree byte for byte,
// or "continue without an account" stops working with no error on either side.
const SECRET = new Uint8Array(32).fill(1)

describe('desktopBridgeProof', () => {
  it('matches the HMAC-SHA256 the backend computes for /auth/local-session', () => {
    expect(desktopBridgeProof(SECRET, 'auth/local-session')).toBe(
      'dda78979dbe0250586d67d89ab428f780e9e8d8ce5527c921bbcaf3cb8f0d4b2',
    )
  })

  it('depends on the context and on the secret', () => {
    const base = desktopBridgeProof(SECRET, 'auth/local-session')
    expect(desktopBridgeProof(SECRET, 'another/context')).not.toBe(base)
    expect(desktopBridgeProof(new Uint8Array(32).fill(2), 'auth/local-session')).not.toBe(base)
  })
})
