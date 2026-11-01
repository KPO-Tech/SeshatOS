import { describe, expect, it } from 'vitest'
import { availableMcp, buildServer, commandLine, MCP_CATALOG, missingInputs } from './mcpCatalog'

const entry = (name: string) => {
  const found = MCP_CATALOG.find((item) => item.name === name)
  if (!found) throw new Error(`no ${name} in the catalog`)
  return found
}

describe('the MCP catalog', () => {
  it('lists each server once, with a way to start it', () => {
    const names = MCP_CATALOG.map((item) => item.name)
    expect(new Set(names).size).toBe(names.length)
    for (const item of MCP_CATALOG) {
      if (item.server_type === 'stdio') expect(item.command, item.name).toBeTruthy()
      else expect(item.url, item.name).toMatch(/^https:\/\//)
    }
  })

  it('names where each server comes from', () => {
    for (const item of MCP_CATALOG) expect(item.source, item.name).toMatch(/^https:\/\//)
  })

  it('offers the ones that are not installed yet', () => {
    const left = availableMcp([{ name: 'Playwright' }, { name: 'mine' }]).map((item) => item.name)
    expect(left).not.toContain('playwright')
    expect(left).toContain('context7')
  })
})

describe('buildServer', () => {
  it('puts a secret in the environment of a command server and leaves out an empty optional one', () => {
    const server = buildServer(entry('figma'), { key: ' figd_abc ' })
    expect(server).toMatchObject({ name: 'figma', server_type: 'stdio', command: 'npx', env: { FIGMA_API_KEY: 'figd_abc' }, enabled: true })
    expect(server.args).toEqual(['-y', 'figma-developer-mcp', '--stdio'])
    expect(buildServer(entry('context7'), { key: '  ' }).env).toEqual({})
  })

  it('adds a connection string as an argument', () => {
    expect(buildServer(entry('dbhub'), { dsn: 'sqlite:///data.db' }).args).toEqual(['-y', '@bytebase/dbhub@latest', '--transport', 'stdio', '--dsn', 'sqlite:///data.db'])
  })

  it('sends a token of a remote server as a bearer header', () => {
    const server = buildServer(entry('huggingface'), { token: 'hf_x' })
    expect(server).toMatchObject({ server_type: 'http', url: 'https://huggingface.co/mcp', command: '', headers: { Authorization: 'Bearer hf_x' } })
    expect(buildServer(entry('huggingface'), {}).headers).toEqual({})
  })
})

describe('missingInputs and commandLine', () => {
  it('asks for what is required only', () => {
    expect(missingInputs(entry('dbhub'), {}).map((input) => input.id)).toEqual(['dsn'])
    expect(missingInputs(entry('dbhub'), { dsn: 'x' })).toEqual([])
    expect(missingInputs(entry('context7'), {})).toEqual([])
  })

  it('shows the command without the secret', () => {
    expect(commandLine(entry('playwright'))).toBe('npx -y @playwright/mcp@latest')
    expect(commandLine(entry('dbhub'), { dsn: 'postgres://u:secret@h/db' })).not.toContain('secret')
  })
})
