import { describe, expect, it } from 'vitest'
import { connectorRows, contextUsage, environmentRows, formatTokens } from './sessionOverview'

describe('contextUsage', () => {
  it('is nothing until tokens have been counted', () => {
    expect(contextUsage(0, 0, 1_000_000)).toBeNull()
  })

  it('adds the reply to the context and gives a percentage of the window', () => {
    expect(contextUsage(500_000, 30_000, 1_000_000)).toEqual({ used: 530_000, window: 1_000_000, percent: 53 })
  })

  it('still reports the tokens when the window is unknown', () => {
    expect(contextUsage(1200, 300, undefined)).toEqual({ used: 1500, window: null, percent: null })
    expect(contextUsage(1200, 300, 0)?.window).toBeNull()
  })

  it('never goes past 100 %', () => {
    expect(contextUsage(2_000, 0, 1_000)?.percent).toBe(100)
  })
})

describe('formatTokens', () => {
  it('writes short numbers', () => {
    expect(formatTokens(96)).toBe('96')
    expect(formatTokens(1000)).toBe('1k')
    expect(formatTokens(530_700)).toBe('530.7k')
    expect(formatTokens(1_000_000)).toBe('1M')
  })
})

describe('environmentRows', () => {
  it('has no rows when there is nothing to say', () => {
    expect(environmentRows({ docker: false })).toEqual([])
  })

  it('says where commands run, in which folder, and warns when nothing confines them', () => {
    expect(environmentRows({ docker: false, workspacePath: 'D:/proj', confinement: { label: 'Not confined', confined: false } })).toEqual([
      { label: 'Runs on', value: 'This computer' },
      { label: 'Folder', value: 'D:/proj' },
      { label: 'Commands', value: 'Not confined', tone: 'warn' }
    ])
  })

  it('names Docker and a confined state without a warning', () => {
    const rows = environmentRows({ docker: true, confinement: { label: 'Docker', confined: true } })
    expect(rows[0]).toEqual({ label: 'Runs on', value: 'A Docker container' })
    expect(rows.find((row) => row.label === 'Commands')?.tone).toBeUndefined()
  })
})

describe('connectorRows', () => {
  const servers = [
    { id: '1', name: 'github', display_name: 'GitHub', server_type: 'http', enabled: true },
    { id: '2', name: 'off', enabled: false },
    { id: '3', name: 'files', server_type: 'stdio', enabled: true }
  ]

  it('lists only enabled connectors, by display name', () => {
    const { shown, total, hidden } = connectorRows(servers)
    expect(shown.map((row) => row.name)).toEqual(['GitHub', 'files'])
    expect(total).toBe(2)
    expect(hidden).toBe(0)
  })

  it('counts what it does not show', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: `s${i}`, enabled: true }))
    expect(connectorRows(many, 4)).toMatchObject({ hidden: 3, total: 7 })
    expect(connectorRows(many, 4).shown).toHaveLength(4)
  })

  it('is empty when nothing is connected', () => {
    expect(connectorRows([]).total).toBe(0)
    expect(connectorRows([{ id: '1', name: 'x', enabled: false }]).total).toBe(0)
  })
})
