import { afterEach, describe, expect, it, vi } from 'vitest'
import { cachedSource, clearSourceCache, dataURLToBlob, loadSource, rememberSize, sourceKey } from './artifactSourceCache'

afterEach(() => clearSourceCache())

describe('artifactSourceCache', () => {
  it('loads a file once and keeps its drawn size', async () => {
    const load = vi.fn(async () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')
    const key = sourceKey('s1', 'aco.gif')
    const [a, b] = await Promise.all([loadSource(key, load), loadSource(key, load)])
    expect(load).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    rememberSize(key, 1300, 720)
    expect(cachedSource(key)).toMatchObject({ url: a.url, width: 1300, height: 720 })
    await loadSource(key, load)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not keep a failed load', async () => {
    const key = sourceKey('s1', 'missing.png')
    await expect(loadSource(key, async () => { throw new Error('404') })).rejects.toThrow('404')
    expect(cachedSource(key)).toBeUndefined()
  })

  it('decodes base64 into bytes of the right type', async () => {
    const blob = dataURLToBlob('data:image/png;base64,AAEC')
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(3)
  })
})
