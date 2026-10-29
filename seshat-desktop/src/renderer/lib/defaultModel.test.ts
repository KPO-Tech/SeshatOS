import { describe, expect, it } from 'vitest'
import { modelOfProvider, pickDefaultChoiceWhenSettled, pickDefaultModel } from './defaultModel'

const model = (model_id: string, is_default = false) => ({ model_id, is_default })
const provider = (id: string, is_default: boolean, model_id?: string) => ({ id, is_default, model_id })

describe('modelOfProvider', () => {
  const models = [model('a'), model('b', true), model('c')]

  it('prefers the model chosen for the provider', () => {
    expect(modelOfProvider({ model_id: 'c' }, models)?.model_id).toBe('c')
  })

  it('falls back to the catalog default, then to the first model', () => {
    expect(modelOfProvider({ model_id: 'gone' }, models)?.model_id).toBe('b')
    expect(modelOfProvider({}, [model('x'), model('y')])?.model_id).toBe('x')
    expect(modelOfProvider({}, [])).toBeNull()
  })
})

describe('pickDefaultModel', () => {
  const catalogs: Record<string, ReturnType<typeof model>[]> = {
    one: [model('one-a', true), model('one-b')],
    two: [model('two-a', true), model('two-b')]
  }

  it('uses the model chosen on the default provider, not another provider catalog default', () => {
    const picked = pickDefaultModel([provider('one', false, 'one-b'), provider('two', true, 'two-b')], (p) => catalogs[p.id])
    expect(picked?.provider.id).toBe('two')
    expect(picked?.model.model_id).toBe('two-b')
  })

  it('moves on to the next provider when the default one has no model', () => {
    const picked = pickDefaultModel([provider('one', false), provider('empty', true)], (p) => catalogs[p.id] ?? [])
    expect(picked?.provider.id).toBe('one')
  })

  it('gives nothing when no provider has a model', () => {
    expect(pickDefaultModel([provider('empty', true)], () => [])).toBeNull()
  })
})

describe('pickDefaultChoiceWhenSettled', () => {
  const choice = (providerId: string, model_id: string, is_default = false) => ({ providerId, model: model(model_id, is_default) })
  const providers = [provider('slow', false, 'slow-pick'), provider('fast', false)]
  const loaded = (ids: string[]) => (p: { id: string }) => ids.includes(p.id)

  it('waits while a provider that comes before the pick has not answered', () => {
    // fast answered first: the first provider, slow, could still be the default
    expect(pickDefaultChoiceWhenSettled(providers, [choice('fast', 'fast-a', true)], loaded(['fast']))).toBeNull()
  })

  it('gives the same model whatever the order the catalogs arrived in', () => {
    const all = [choice('slow', 'slow-pick'), choice('slow', 'slow-other'), choice('fast', 'fast-a', true)]
    expect(pickDefaultChoiceWhenSettled(providers, all, loaded(['slow', 'fast']))?.model.model_id).toBe('slow-pick')
    expect(pickDefaultChoiceWhenSettled(providers, all, loaded(['fast', 'slow']))?.model.model_id).toBe('slow-pick')
  })

  it('does not wait for a provider after the pick, and moves on from a provider with no model', () => {
    expect(pickDefaultChoiceWhenSettled(providers, [choice('slow', 'slow-pick')], loaded(['slow']))?.model.model_id).toBe('slow-pick')
    expect(pickDefaultChoiceWhenSettled(providers, [choice('fast', 'fast-a', true)], loaded(['slow', 'fast']))?.model.model_id).toBe('fast-a')
  })
})
