import { describe, expect, it } from 'vitest'
import { isWebTool } from './webTools'

describe('isWebTool', () => {
  it('is true for the tools that read the web', () => {
    for (const name of ['web_search', 'web_fetch', 'read_url', 'read_document_url']) expect(isWebTool(name)).toBe(true)
  })

  it('is false for the others, the browser included', () => {
    for (const name of ['bash', 'read_file', 'browser_navigate', 'mcp__notion__search']) expect(isWebTool(name)).toBe(false)
  })
})
