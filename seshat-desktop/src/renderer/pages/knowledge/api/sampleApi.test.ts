import { describe, expect, it } from 'vitest'
import { composeAnswer, pickScript, SAMPLE_QUESTIONS, sampleKnowledgeApi } from './sampleApi'
import { SAMPLE_COLLECTIONS, SAMPLE_DOCUMENTS } from './sampleData'
import type { AskEvent } from './types'

async function collect(question: string, collectionId: string | null = null): Promise<AskEvent[]> {
  const events: AskEvent[] = []
  for await (const event of sampleKnowledgeApi.ask({ question, scope: { collectionId } }, new AbortController().signal)) events.push(event)
  return events
}

describe('sample documents', () => {
  it('count the documents of each collection', () => {
    for (const collection of SAMPLE_COLLECTIONS) {
      expect(SAMPLE_DOCUMENTS.filter((doc) => doc.collectionId === collection.id)).toHaveLength(collection.documentCount)
    }
  })

  it('hold every passage the sample answers cite', async () => {
    for (const question of SAMPLE_QUESTIONS) {
      const script = pickScript(question)
      expect(script).not.toBeNull()
      for (const claim of script!.claims) {
        const page = SAMPLE_DOCUMENTS.find((doc) => doc.id === claim.documentId)?.pages.find((item) => item.number === claim.page)
        expect(page?.text, `${claim.documentId} page ${claim.page}`).toContain(claim.excerpt)
      }
    }
  })
})

describe('composeAnswer', () => {
  it('gives a passage used twice one number', () => {
    const claim = { text: 'A.', documentId: 'd', page: 1, excerpt: 'x' }
    const { text, sources } = composeAnswer([claim, { ...claim, text: 'B.' }])
    expect(sources).toHaveLength(1)
    expect(text).toBe('A. [1] B. [1]')
  })
})

describe('ask', () => {
  it('searches, names its sources, streams the answer, then states its limits', async () => {
    const events = await collect(SAMPLE_QUESTIONS[0])
    expect(events.map((event) => event.type)).toEqual(['searching', 'sources', ...Array(events.length - 3).fill('text'), 'done'])
    const sources = events.find((event) => event.type === 'sources')
    expect(sources && sources.type === 'sources' && sources.sources).toHaveLength(2)
    const done = events.at(-1)
    expect(done && done.type === 'done' && done.limits.documentsUsed).toBe(2)
  })

  it('drops the claims outside a narrowed collection and renumbers the rest', async () => {
    const events = await collect(SAMPLE_QUESTIONS[0], 'legal')
    const text = events.flatMap((event) => (event.type === 'text' ? [event.delta] : [])).join('')
    expect(text).toContain('sixty days')
    expect(text).not.toContain('thirty days')
    expect(text).not.toContain('[2]')
  })

  it('says so when nothing matches, with no sources', async () => {
    const events = await collect('What is the colour of the moon?')
    const done = events.at(-1)
    expect(done && done.type === 'done' && done.limits.notFound).toBeTruthy()
    const sources = events.find((event) => event.type === 'sources')
    expect(sources && sources.type === 'sources' && sources.sources).toEqual([])
  })
})
