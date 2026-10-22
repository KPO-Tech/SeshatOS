import { beforeEach, describe, expect, it } from 'vitest'
import { renamedStorage } from './renamedStorage'

// The suite runs under vitest's 'node' environment, which has no DOM: a small in-memory Storage stands in.
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null }
  setItem(key: string, value: string) { this.store.set(key, value) }
  removeItem(key: string) { this.store.delete(key) }
  clear() { this.store.clear() }
}
;(globalThis as unknown as { localStorage?: MemoryStorage }).localStorage = new MemoryStorage()

describe('renamedStorage', () => {
  beforeEach(() => localStorage.clear())

  it('adopts the value saved under the legacy key and removes it', async () => {
    localStorage.setItem('old-key', '{"state":{"a":1},"version":0}')
    const storage = renamedStorage<{ a: number }>('old-key')!

    expect(await storage.getItem('new-key')).toEqual({ state: { a: 1 }, version: 0 })
    expect(localStorage.getItem('old-key')).toBeNull()
    expect(localStorage.getItem('new-key')).not.toBeNull()
  })

  it('prefers the new key when both exist', async () => {
    localStorage.setItem('old-key', '{"state":{"a":1},"version":0}')
    localStorage.setItem('new-key', '{"state":{"a":2},"version":0}')
    const storage = renamedStorage<{ a: number }>('old-key')!

    expect(await storage.getItem('new-key')).toEqual({ state: { a: 2 }, version: 0 })
  })

  it('returns null when neither key exists', async () => {
    expect(await renamedStorage('old-key')!.getItem('new-key')).toBeNull()
  })
})
