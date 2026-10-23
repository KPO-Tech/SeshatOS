import { describe, expect, it } from 'vitest'
import { collectWebSources, webSourcesByTurnEnd } from './webSources'

const search = (hits: Array<[string, string]>) => ({
  type: 'tool_use',
  name: 'web_search',
  input: { query: 'q' },
  _result: { isError: false, content: hits.map(([title, url], i) => `${i + 1}. ${title}\n${url}\nA snippet.`).join('\n\n') }
})
const fetchPage = (url: string, isError = false) => ({ type: 'tool_use', name: 'web_fetch', input: { url }, _result: { isError, content: `Fetched from: ${url}` } })
const message = (role: string, ...content: Array<Record<string, unknown>>) => ({ role, content: content as Array<{ type: string }> })

describe('collectWebSources', () => {
  it('lists the pages the agent read, titled from the search that found them', () => {
    const sources = collectWebSources([
      message('assistant', search([['Playwright for Go', 'https://github.com/playwright-community/playwright-go'], ['Other', 'https://example.com/other']])),
      message('assistant', fetchPage('https://github.com/playwright-community/playwright-go/'))
    ])
    expect(sources).toEqual([{ url: 'https://github.com/playwright-community/playwright-go/', title: 'Playwright for Go', domain: 'github.com' }])
  })

  it('falls back to the first results of the searches when no page was read', () => {
    const hits = Array.from({ length: 9 }, (_, i): [string, string] => [`Result ${i}`, `https://site${i}.example.com/page`])
    const sources = collectWebSources([message('assistant', search(hits))])
    expect(sources).toHaveLength(6)
    expect(sources[0]).toEqual({ url: 'https://site0.example.com/page', title: 'Result 0', domain: 'site0.example.com' })
  })

  it('names a page read without a search from its address, and lists it once', () => {
    const sources = collectWebSources([
      message('assistant', fetchPage('https://docs.example.com/guide/getting-started.html'), fetchPage('https://docs.example.com/guide/getting-started.html#top'))
    ])
    expect(sources).toEqual([{ url: 'https://docs.example.com/guide/getting-started.html', title: 'getting started', domain: 'docs.example.com' }])
  })

  it('ignores calls that failed and addresses that are not web pages', () => {
    const local = { type: 'tool_use', name: 'web_fetch', input: { url: 'file:///etc/passwd' }, _result: { isError: false, content: '' } }
    expect(collectWebSources([message('assistant', fetchPage('https://example.com', true), local)])).toEqual([])
  })
})

describe('webSourcesByTurnEnd', () => {
  it('puts the sources under the message that ends the turn', () => {
    const messages = [
      message('user', { type: 'text' }),
      message('assistant', fetchPage('https://example.com/a')),
      message('assistant', { type: 'text' }),
      message('user', { type: 'text' }),
      message('assistant', { type: 'text' })
    ]
    expect([...webSourcesByTurnEnd(messages, false).keys()]).toEqual([2])
  })

  it('waits for the end of a turn that is still streaming', () => {
    const messages = [message('user', { type: 'text' }), message('assistant', fetchPage('https://example.com/a'))]
    expect(webSourcesByTurnEnd(messages, true).size).toBe(0)
    expect(webSourcesByTurnEnd(messages, false).size).toBe(1)
  })
})
