import { describe, expect, it } from 'vitest'
import { collectConsultedPages, collectWebSources, findWebSource, listedSources, webSourcesByTurnEnd, webSourcesSoFar } from './webSources'

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

describe('citations in an answer', () => {
  const hits = Array.from({ length: 9 }, (_, i): [string, string] => [`Result ${i}`, `https://site${i}.example.com/page`])

  it('checks a link against every page that came back, not only the ones listed under the answer', () => {
    const messages = [message('assistant', search(hits))]
    expect(collectWebSources(messages)).toHaveLength(6)
    expect(collectConsultedPages(messages)).toHaveLength(9)
  })

  it('finds the source of a link, whatever its fragment, trailing slash or case', () => {
    const pages = collectConsultedPages([message('assistant', search([['Playwright', 'https://github.com/playwright-community/playwright-go']]))])
    expect(findWebSource('https://GitHub.com/playwright-community/playwright-go/#readme', pages)?.title).toBe('Playwright')
    expect(findWebSource('https://github.com/somebody/else', pages)).toBeUndefined()
    expect(findWebSource(undefined, pages)).toBeUndefined()
  })

  it('knows, for each message, the pages consulted up to it in its own turn', () => {
    const messages = [
      message('user', { type: 'text' }),
      message('assistant', fetchPage('https://example.com/a')),
      message('assistant', fetchPage('https://example.com/b')),
      message('user', { type: 'text' }),
      message('assistant', { type: 'text' })
    ]
    const so = webSourcesSoFar(messages)
    expect(so.get(1)?.map((item) => item.url)).toEqual(['https://example.com/a'])
    expect(so.get(2)?.map((item) => item.url)).toEqual(['https://example.com/a', 'https://example.com/b'])
    expect(so.has(4)).toBe(false)
  })
})

describe('listedSources', () => {
  const hits: Array<[string, string]> = [['One', 'https://one.example.com/a'], ['Two', 'https://two.example.com/b'], ['Three', 'https://three.example.com/c']]
  const answer = (text: string) => message('assistant', { type: 'text', text })

  it('leaves out the pages the text already cites', () => {
    const turn = [message('assistant', search(hits)), answer('See [one](https://one.example.com/a) and https://two.example.com/b/ for details.')]
    expect(listedSources(turn).map((source) => source.title)).toEqual(['Three'])
  })

  it('keeps every source when the text cites none', () => {
    const turn = [message('assistant', search(hits)), answer('No links here.')]
    expect(listedSources(turn)).toHaveLength(3)
  })

  it('lists nothing when the text cites all of them', () => {
    const turn = [message('assistant', search(hits)), answer('[a](https://one.example.com/a) [b](https://two.example.com/b) [c](https://three.example.com/c)')]
    expect(listedSources(turn)).toEqual([])
  })
})
