import { describe, expect, it } from 'vitest'
import type { ProviderModel, ProviderSetting } from '../providers/providerTypes'
import { matchesModelSearch } from './modelUtils'

const model = { display_name: 'GLM 4.6', model_id: 'glm-4.6' } as ProviderModel
const provider = { name: 'Z.ai', provider: 'zai' } as ProviderSetting

describe('matchesModelSearch', () => {
  it('finds a model by name, id or provider', () => {
    expect(matchesModelSearch(model, provider, 'glm')).toBe(true)
    expect(matchesModelSearch(model, provider, 'GLM-4.6')).toBe(true)
    expect(matchesModelSearch(model, provider, 'z.ai')).toBe(true)
  })

  it('needs every word to be found', () => {
    expect(matchesModelSearch(model, provider, 'glm 4.6')).toBe(true)
    expect(matchesModelSearch(model, provider, 'glm mistral')).toBe(false)
  })
})
