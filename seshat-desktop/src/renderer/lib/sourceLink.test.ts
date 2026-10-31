import { describe, expect, it } from 'vitest'
import { sourceLabel } from './sourceLink'

describe('sourceLabel', () => {
  it('shows owner/repo for a repository on a known host', () => {
    expect(sourceLabel('https://github.com/upstash/context7')).toBe('upstash/context7')
    expect(sourceLabel('https://github.com/microsoft/playwright-mcp.git')).toBe('microsoft/playwright-mcp')
    expect(sourceLabel('https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking')).toBe('modelcontextprotocol/servers')
    expect(sourceLabel('https://www.gitlab.com/a/b/')).toBe('a/b')
  })

  it('shows the host and the path for any other address', () => {
    expect(sourceLabel('https://huggingface.co/docs/hub/mcp')).toBe('huggingface.co/docs/hub/mcp')
    expect(sourceLabel('https://www.example.com/')).toBe('example.com')
  })

  it('leaves an address it cannot read as it is', () => {
    expect(sourceLabel('not an address')).toBe('not an address')
  })
})
