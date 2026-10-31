import { describe, expect, it } from 'vitest'
import { compactionNote, connectorRows, contextUsage, environmentRows, formatTokens, liveContextAfterCompaction, streamedChars, tokensSinceReport } from './sessionOverview'

describe('contextUsage with the figure the runtime reported', () => {
  const live = { used: 90_000, window: 128_000, autoCompactAt: 107_100 }

  it('prefers the figure reported during the turn to the totals of the last turn', () => {
    expect(contextUsage(10_000, 1_000, 200_000, live)).toEqual({ used: 90_000, window: 128_000, percent: 70, compactAtPercent: 84 })
  })

  it('shows a figure even before any turn has completed', () => {
    expect(contextUsage(0, 0, null, live)?.percent).toBe(70)
  })

  it('caps the percentages at 100', () => {
    const over = contextUsage(0, 0, null, { used: 150_000, window: 128_000, autoCompactAt: 200_000 })
    expect(over?.percent).toBe(100)
    expect(over?.compactAtPercent).toBe(100)
  })

  it('has no compaction mark when the runtime did not say where it is', () => {
    expect(contextUsage(0, 0, null, { used: 1000, window: 128_000, autoCompactAt: 0 })?.compactAtPercent).toBeNull()
  })

  it('ignores an empty or unusable figure and falls back to the last turn', () => {
    expect(contextUsage(500, 100, 1000, { used: 0, window: 128_000, autoCompactAt: 1 })?.used).toBe(600)
    expect(contextUsage(500, 100, 1000, { used: 5, window: 0, autoCompactAt: 1 })?.used).toBe(600)
    expect(contextUsage(500, 100, 1000, null)?.used).toBe(600)
  })
})

describe('contextUsage', () => {
  it('is nothing until tokens have been counted', () => {
    expect(contextUsage(0, 0, 1_000_000)).toBeNull()
  })

  it('adds the reply to the context and gives a percentage of the window', () => {
    expect(contextUsage(500_000, 30_000, 1_000_000)).toEqual({ used: 530_000, window: 1_000_000, percent: 53, compactAtPercent: null })
  })

  it('still reports the tokens when the window is unknown', () => {
    expect(contextUsage(1200, 300, undefined)).toEqual({ used: 1500, window: null, percent: null, compactAtPercent: null })
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

  it('names the git branch under the folder, and says when files are not committed', () => {
    expect(environmentRows({ docker: false, workspacePath: 'D:/proj', git: { repo: true, branch: 'dev' } }).map((row) => [row.label, row.value])).toEqual([
      ['Runs on', 'This computer'],
      ['Folder', 'D:/proj'],
      ['Branch', 'dev']
    ])
    expect(environmentRows({ docker: false, workspacePath: 'D:/proj', git: { repo: true, branch: 'dev', dirty: true } }).find((row) => row.label === 'Branch')?.value).toBe('dev, with changes')
  })

  it('shows the short commit of a detached head and no row outside a repository', () => {
    expect(environmentRows({ docker: false, workspacePath: 'D:/proj', git: { repo: true, branch: 'a1b2c3d', detached: true } }).find((row) => row.label === 'Branch')?.value).toBe('a1b2c3d (detached)')
    expect(environmentRows({ docker: false, workspacePath: 'D:/proj', git: { repo: false } }).some((row) => row.label === 'Branch')).toBe(false)
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

describe('compaction on demand', () => {
  it('says how far the conversation shrank', () => {
    expect(compactionNote({ pre_tokens: 90_000, post_tokens: 30_500 })).toBe('Compacted: 90k to 30.5k tokens.')
  })

  it('takes the size after from the result and keeps the window and the automatic mark of the figure before', () => {
    const before = { used: 100_000, window: 128_000, autoCompactAt: 107_100 }
    expect(liveContextAfterCompaction({ pre_tokens: 100_000, post_tokens: 30_000 }, before, 200_000)).toEqual({
      used: 30_000, window: 128_000, autoCompactAt: 107_100,
    })
  })

  it('falls back to the known window of the model when there was no figure before', () => {
    expect(liveContextAfterCompaction({ pre_tokens: 100_000, post_tokens: 30_000 }, null, 128_000)).toEqual({
      used: 30_000, window: 128_000, autoCompactAt: 0,
    })
  })

  it('draws nothing without a window or a size', () => {
    expect(liveContextAfterCompaction({ pre_tokens: 1, post_tokens: 30_000 }, null, null)).toBeNull()
    expect(liveContextAfterCompaction({ pre_tokens: 1, post_tokens: 0 }, null, 128_000)).toBeNull()
  })
})

describe('the gauge between two reports of the runtime', () => {
  const live = { used: 20_000, window: 200_000, autoCompactAt: 170_000, atChars: 1_000 }

  it('counts the characters of the text and the tool arguments written so far, not the reasoning', () => {
    expect(streamedChars([
      { type: 'text', text: 'abcd' },
      { type: 'thinking', thinking: 'a long reasoning that is not part of the context' },
      { type: 'tool_use', _partialInput: '{"a":' },
    ])).toBe(9)
    expect(streamedChars(undefined)).toBe(0)
  })

  it('estimates the tokens written since the last report at four characters a token', () => {
    expect(tokensSinceReport(1_000, live)).toBe(0)
    expect(tokensSinceReport(1_400, live)).toBe(100)
    expect(tokensSinceReport(1_401, live)).toBe(101)
  })

  it('estimates nothing without a report, and never a negative figure when a new turn starts streaming from zero', () => {
    expect(tokensSinceReport(5_000, null)).toBe(0)
    expect(tokensSinceReport(0, live)).toBe(0)
  })

  it('adds the estimate to the last reported figure', () => {
    const usage = contextUsage(0, 0, 200_000, live, 4_000)
    expect(usage).toMatchObject({ used: 24_000, window: 200_000, percent: 12, compactAtPercent: 85 })
  })

  it('stops at the full window', () => {
    expect(contextUsage(0, 0, 200_000, live, 500_000)?.percent).toBe(100)
  })

  it('does not change the figure of a turn that has nothing pending', () => {
    expect(contextUsage(0, 0, 200_000, live)?.used).toBe(20_000)
  })
})
