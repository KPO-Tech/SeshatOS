import { describe, expect, it } from 'vitest'
import { collectPullUrls, pullSubtitle } from './pullRequests'

const tool = (name: string, content: string, isError = false) => ({ type: 'tool_use' as const, name, _result: { content, isError } })
const assistant = (...content: Array<{ type: string }>) => ({ role: 'assistant', content })

describe('collectPullUrls', () => {
  it('reads the address a shell printed when the agent opened a pull request', () => {
    const urls = collectPullUrls([assistant(tool('Bash', 'https://github.com/KPO-Tech/SeshatOS/pull/344\n'))])
    expect(urls).toEqual(['https://github.com/KPO-Tech/SeshatOS/pull/344'])
  })

  it('lists the most recent first and each address once', () => {
    const urls = collectPullUrls([
      assistant(tool('bash', 'https://github.com/o/r/pull/1')),
      assistant(tool('powershell', 'https://github.com/o/r/pull/2'), tool('bash', 'https://github.com/o/r/pull/1'))
    ])
    expect(urls).toEqual(['https://github.com/o/r/pull/1', 'https://github.com/o/r/pull/2'])
  })

  it('ignores failed calls, other tools and other hosts', () => {
    const urls = collectPullUrls([
      assistant(tool('bash', 'https://github.com/o/r/pull/3', true)),
      assistant(tool('web_fetch', 'https://github.com/o/r/pull/4')),
      assistant(tool('bash', 'https://gitlab.com/o/r/pull/5'))
    ])
    expect(urls).toEqual([])
  })

  it('stops at ten addresses', () => {
    const text = Array.from({ length: 15 }, (_, i) => `https://github.com/o/r/pull/${i + 1}`).join(' ')
    expect(collectPullUrls([assistant(tool('bash', text))])).toHaveLength(10)
  })
})

describe('pullSubtitle', () => {
  it('names the repository and the number', () => {
    expect(pullSubtitle({ owner: 'KPO-Tech', repo: 'SeshatOS', number: 279 })).toBe('SeshatOS #279')
  })
})
