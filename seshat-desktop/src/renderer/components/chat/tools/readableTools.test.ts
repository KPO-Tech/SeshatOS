import { describe, expect, it } from 'vitest'
import { opensWide } from './readableTools'

describe('opensWide', () => {
  it('is true for the tools that return text to read', () => {
    expect(opensWide('knowledge_search')).toBe(true)
    expect(opensWide('knowledge_read')).toBe(true)
  })

  it('is false for the others', () => {
    expect(opensWide('bash')).toBe(false)
    expect(opensWide('web_search')).toBe(false)
    expect(opensWide('')).toBe(false)
  })
})
