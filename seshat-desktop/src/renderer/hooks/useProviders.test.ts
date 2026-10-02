import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('@renderer/api/client', () => ({ api: { get: (...args: unknown[]) => get(...args) } }))
vi.mock('@renderer/stores/auth', () => ({ useAuthStore: () => true }))

import { refreshProviders } from './useProviders'
import { useProvidersStore } from '@renderer/stores/providers'

const provider = (id: string) => ({ id, name: id }) as never

describe('refreshProviders', () => {
  beforeEach(() => {
    get.mockReset()
    useProvidersStore.setState({ providers: [], version: 0 })
  })

  it('loads the provider list into the shared store and bumps the version', async () => {
    get.mockResolvedValue({ settings: [provider('ps_1'), provider('ps_2')], count: 2 })

    await refreshProviders()

    expect(get).toHaveBeenCalledWith('/settings/providers')
    expect(useProvidersStore.getState().providers.map((p) => p.id)).toEqual(['ps_1', 'ps_2'])
    expect(useProvidersStore.getState().version).toBe(1)
  })

  it('keeps the current list but still invalidates model caches when the fetch fails', async () => {
    useProvidersStore.setState({ providers: [provider('ps_old')] })
    get.mockRejectedValue(new Error('backend unavailable'))

    await refreshProviders()

    expect(useProvidersStore.getState().providers.map((p) => p.id)).toEqual(['ps_old'])
    expect(useProvidersStore.getState().version).toBe(1)
  })
})
