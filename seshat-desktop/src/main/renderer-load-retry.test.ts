import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RETRY_URL, buildLoadFailureUrl, createLoadRetry, isRetryNavigation } from './renderer-load-retry'

describe('createLoadRetry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reloads after each failure with a growing delay, then gives up', () => {
    const load = vi.fn()
    const onGiveUp = vi.fn()
    const retry = createLoadRetry({ load, onGiveUp, delaysMs: [100, 200] })

    retry.failed()
    vi.advanceTimersByTime(99)
    expect(load).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(load).toHaveBeenCalledTimes(1)

    retry.failed()
    vi.advanceTimersByTime(200)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onGiveUp).not.toHaveBeenCalled()

    retry.failed()
    expect(onGiveUp).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('ignores a failure reported while a retry is already pending', () => {
    const load = vi.fn()
    const retry = createLoadRetry({ load, onGiveUp: vi.fn(), delaysMs: [100, 100] })

    retry.failed()
    retry.failed()
    vi.advanceTimersByTime(1000)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('starts over after a reset', () => {
    const load = vi.fn()
    const onGiveUp = vi.fn()
    const retry = createLoadRetry({ load, onGiveUp, delaysMs: [100] })

    retry.failed()
    vi.advanceTimersByTime(100)
    retry.reset()
    retry.failed()
    vi.advanceTimersByTime(100)
    expect(load).toHaveBeenCalledTimes(2)
    expect(onGiveUp).not.toHaveBeenCalled()
  })

  it('does not reload once cancelled', () => {
    const load = vi.fn()
    const retry = createLoadRetry({ load, onGiveUp: vi.fn(), delaysMs: [100] })

    retry.failed()
    retry.cancel()
    vi.advanceTimersByTime(1000)
    expect(load).not.toHaveBeenCalled()
  })
})

describe('buildLoadFailureUrl', () => {
  it('escapes the detail and offers a retry link', () => {
    const url = decodeURIComponent(buildLoadFailureUrl('<b>ERR_FAILED</b>'))
    expect(url.startsWith('data:text/html')).toBe(true)
    expect(url).toContain('&lt;b&gt;ERR_FAILED&lt;/b&gt;')
    expect(url).not.toContain('<b>ERR_FAILED')
    expect(url).toContain(`href="${RETRY_URL}"`)
  })
})

describe('isRetryNavigation', () => {
  it('recognises only the failure page retry link', () => {
    expect(isRetryNavigation(RETRY_URL)).toBe(true)
    expect(isRetryNavigation('http://localhost:5173/#retry')).toBe(false)
    expect(isRetryNavigation(buildLoadFailureUrl('x'))).toBe(false)
  })
})
