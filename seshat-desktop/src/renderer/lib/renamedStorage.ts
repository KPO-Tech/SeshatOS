import { createJSONStorage, type PersistStorage } from 'zustand/middleware'

/**
 * localStorage for a persisted store that moved to a new key: the first read under the new key
 * adopts the value saved under the old one and removes it, so a user keeps their saved state.
 */
export function renamedStorage<S>(legacyName: string): PersistStorage<S> | undefined {
  return createJSONStorage<S>(() => {
    const storage = localStorage
    return {
      getItem: (name) => {
        const current = storage.getItem(name)
        if (current !== null) return current
        const legacy = storage.getItem(legacyName)
        if (legacy === null) return null
        storage.setItem(name, legacy)
        storage.removeItem(legacyName)
        return legacy
      },
      setItem: (name, value) => storage.setItem(name, value),
      removeItem: (name) => storage.removeItem(name)
    }
  })
}
