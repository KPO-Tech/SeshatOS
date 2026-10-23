import { parseWebSearchHits } from '@renderer/components/chat/tools/helpers'
import { byTurnEnd } from './turns'

export type WebSource = {
  url: string
  title: string
  domain: string
}

type ToolBlock = {
  type: 'tool_use'
  name: string
  input: Record<string, unknown>
  _result?: { content?: string; isError: boolean }
}

type MessageLike = { role: string; content: ReadonlyArray<{ type: string }> }

const SEARCH_TOOLS = new Set(['web_search'])
const FETCH_TOOLS = new Set(['web_fetch', 'read_url', 'read_document_url'])
// Without a page the agent read, the results of its searches stand in, a few of them: a long list of results nobody opened is not a list of sources.
const MAX_SEARCH_SOURCES = 6

function isToolBlock(block: { type: string }): block is ToolBlock {
  return block.type === 'tool_use'
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function sameAddress(url: string): string {
  return url.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase()
}

// A page the agent read has no title in its result: the title of the search hit with the same address when there is one, else the last part of the path.
function titleFor(url: string, hitTitles: Map<string, string>): string {
  const known = hitTitles.get(sameAddress(url))
  if (known) return known
  try {
    const { pathname } = new URL(url)
    const last = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '')
      .replace(/[-_]+/g, ' ')
      .replace(/\.[a-z0-9]{1,5}$/i, '')
    return last || domainOf(url) || url
  } catch {
    return url
  }
}

type Scan = { hitTitles: Map<string, string>; hits: Array<{ url: string; title: string }>; fetched: string[] }

function scan(messages: readonly MessageLike[]): Scan {
  const hitTitles = new Map<string, string>()
  const hits: Array<{ url: string; title: string }> = []
  const fetched: string[] = []
  for (const message of messages) {
    for (const block of message.content) {
      if (!isToolBlock(block) || !block._result || block._result.isError) continue
      if (SEARCH_TOOLS.has(block.name)) {
        for (const hit of parseWebSearchHits(block._result.content)) {
          hitTitles.set(sameAddress(hit.url), hit.title)
          hits.push({ url: hit.url, title: hit.title })
        }
      } else if (FETCH_TOOLS.has(block.name) && typeof block.input.url === 'string' && /^https?:\/\//i.test(block.input.url)) {
        fetched.push(block.input.url)
      }
    }
  }
  return { hitTitles, hits, fetched }
}

function listOf(items: Array<{ url: string; title: string }>, hitTitles: Map<string, string>, limit: number): WebSource[] {
  const seen = new Set<string>()
  const sources: WebSource[] = []
  for (const item of items) {
    const key = sameAddress(item.url)
    if (seen.has(key)) continue
    seen.add(key)
    sources.push({ url: item.url, title: item.title || titleFor(item.url, hitTitles), domain: domainOf(item.url) })
    if (sources.length >= limit) break
  }
  return sources
}

/** The web pages behind the answer of a turn: the ones the agent read, or, if it read none, the first results of its searches. */
export function collectWebSources(messages: readonly MessageLike[]): WebSource[] {
  const { hitTitles, hits, fetched } = scan(messages)
  if (fetched.length > 0) return listOf(fetched.map((url) => ({ url, title: titleFor(url, hitTitles) })), hitTitles, Number.MAX_SAFE_INTEGER)
  return listOf(hits, hitTitles, MAX_SEARCH_SOURCES)
}

/** Every page that came back to the agent, read or only found: what a link in its answer can be checked against. */
export function collectConsultedPages(messages: readonly MessageLike[]): WebSource[] {
  const { hitTitles, hits, fetched } = scan(messages)
  return listOf([...fetched.map((url) => ({ url, title: titleFor(url, hitTitles) })), ...hits], hitTitles, Number.MAX_SAFE_INTEGER)
}

export function webSourcesByTurnEnd<M extends MessageLike>(messages: readonly M[], streaming: boolean): Map<number, WebSource[]> {
  return byTurnEnd(messages, streaming, collectWebSources)
}

/** The source a link of an answer points to, if the agent consulted that page. Compared without the fragment, the trailing slash or the case. */
export function findWebSource(href: string | undefined, sources: readonly WebSource[]): WebSource | undefined {
  if (!href) return undefined
  const wanted = sameAddress(href)
  return sources.find((source) => sameAddress(source.url) === wanted)
}

/**
 * For each assistant message, the pages consulted from the start of its turn up to that message. The key is the message index.
 */
export function webSourcesSoFar<M extends MessageLike>(messages: readonly M[]): Map<number, WebSource[]> {
  const result = new Map<number, WebSource[]>()
  let turnStart = -1
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      turnStart = i
      continue
    }
    const found = collectConsultedPages(messages.slice(turnStart + 1, i + 1))
    if (found.length > 0) result.set(i, found)
  }
  return result
}
