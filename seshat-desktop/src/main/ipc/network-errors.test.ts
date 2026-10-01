import assert from 'node:assert/strict'
import test from 'node:test'

import { isRetryableNetworkError } from './network-errors.js'

test('isRetryableNetworkError treats a pre-connection TypeError as retryable', () => {
  assert.equal(isRetryableNetworkError(new TypeError('fetch failed')), true)
})

test('isRetryableNetworkError treats a known mid-stream socket error code as retryable', () => {
  for (const code of ['UND_ERR_SOCKET', 'UND_ERR_BODY_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE']) {
    const error = new Error('other side closed') as NodeJS.ErrnoException
    error.code = code
    assert.equal(isRetryableNetworkError(error), true, `expected code ${code} to be retryable`)
  }
})

test('isRetryableNetworkError treats a plain "terminated" mid-stream error as retryable', () => {
  // This is the literal error shape from the real incident this guards
  // against: a mid-stream socket death with no .code set, message
  // "terminated" — previously classified as non-retryable because it isn't
  // a TypeError, so no reconnect was ever attempted.
  assert.equal(isRetryableNetworkError(new Error('terminated')), true)
})

test('isRetryableNetworkError rejects an unrelated application error', () => {
  assert.equal(isRetryableNetworkError(new Error('Unauthorized')), false)
  assert.equal(isRetryableNetworkError(new RangeError('out of range')), false)
  assert.equal(isRetryableNetworkError('not an error object'), false)
  assert.equal(isRetryableNetworkError(undefined), false)
})
