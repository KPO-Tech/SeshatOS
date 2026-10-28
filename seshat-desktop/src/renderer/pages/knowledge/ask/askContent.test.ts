import { describe, expect, it } from 'vitest'
import { CAPABILITIES, EXAMPLES } from './askContent'

describe('what the Ask screen offers', () => {
  it('starts a question with every card that is available, and with none that is not', () => {
    for (const capability of CAPABILITIES) {
      if (capability.soon) expect(capability.prompt).toBe('')
      else expect(capability.prompt.trim().length).toBeGreaterThan(0)
    }
    expect(CAPABILITIES.filter((capability) => capability.soon).map((capability) => capability.id)).toEqual(['data', 'sources'])
  })

  it('gives each example the beginning of a question, with an id of its own', () => {
    for (const entry of EXAMPLES) expect(entry.prompt.trim().length).toBeGreaterThan(0)
    expect(new Set(EXAMPLES.map((example) => example.id)).size).toBe(EXAMPLES.length)
  })
})
