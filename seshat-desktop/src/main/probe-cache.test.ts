import { describe, expect, it, vi } from 'vitest'
import { createProbeCache } from './probe-cache'

describe('createProbeCache', () => {
  it('runs the probe once and remembers the answer', async () => {
    const probe = vi.fn().mockResolvedValue('ready')
    const cache = createProbeCache(probe)

    expect(await cache.get()).toBe('ready')
    expect(await cache.get()).toBe('ready')
    expect(probe).toHaveBeenCalledTimes(1)
    expect(cache.peek()).toBe('ready')
  })

  it('does not run the probe to answer a peek', () => {
    const probe = vi.fn().mockResolvedValue('ready')
    expect(createProbeCache(probe).peek()).toBeNull()
    expect(probe).not.toHaveBeenCalled()
  })

  it('shares one probe between calls made while it runs', async () => {
    let finish: (value: string) => void = () => undefined
    const probe = vi.fn(() => new Promise<string>((resolve) => { finish = resolve }))
    const cache = createProbeCache(probe)

    const first = cache.get()
    const second = cache.get()
    finish('ready')

    expect(await first).toBe('ready')
    expect(await second).toBe('ready')
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('probes again only when asked to refresh', async () => {
    const probe = vi.fn().mockResolvedValueOnce('needs-setup').mockResolvedValueOnce('ready')
    const cache = createProbeCache(probe)

    expect(await cache.get()).toBe('needs-setup')
    expect(await cache.get(true)).toBe('ready')
    expect(await cache.get()).toBe('ready')
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('lets a failed probe be tried again', async () => {
    const probe = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ready')
    const cache = createProbeCache(probe)

    await expect(cache.get()).rejects.toThrow('boom')
    expect(cache.peek()).toBeNull()
    expect(await cache.get()).toBe('ready')
  })

  it('takes an answer set from outside', async () => {
    const probe = vi.fn().mockResolvedValue('unavailable')
    const cache = createProbeCache(probe)
    cache.set('ready')
    expect(await cache.get()).toBe('ready')
    expect(probe).not.toHaveBeenCalled()
  })
})
