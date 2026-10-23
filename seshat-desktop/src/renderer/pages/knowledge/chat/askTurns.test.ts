import { describe, expect, it } from 'vitest'
import { deriveTurns } from './askTurns'

const RESULT = [
  'The following excerpts were retrieved.',
  '',
  '[1] ref=k7f3a91 score=0.9 corpus=Legal file=Supplier contract template.docx pages=12',
  'Either party may end this agreement by giving sixty days written notice.',
  '',
  '[2] ref=kc91b04 score=0.7 corpus=Procurement file=Framework agreement.pdf pages=4',
  'The notice period is thirty days under this framework agreement.'
].join('\n')

const user = (text: string) => ({ role: 'user', content: [{ type: 'text', text }] })
const search = (content?: string, metadata?: Record<string, unknown>) => ({
  type: 'tool_use',
  name: 'knowledge_search',
  _result: content === undefined ? undefined : { content, isError: false, metadata }
})
const assistant = (...content: Array<Record<string, unknown>>) => ({ role: 'assistant', content: content as Array<{ type: string }> })
const text = (value: string) => ({ type: 'text', text: value })

describe('deriveTurns', () => {
  it('reads the excerpts of a search and the citations of the answer, in the order of the text', () => {
    const turns = deriveTurns(
      [user('What is the notice period?'), assistant(search(RESULT, { corpora_searched: 3 }), text('Thirty days for logistics [kc91b04], sixty otherwise [k7f3a91].'))],
      false
    )
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ question: 'What is the notice period?', phase: 'done', searches: 1, collectionsSearched: 3 })
    expect(turns[0].passages.map((passage) => passage.ref)).toEqual(['k7f3a91', 'kc91b04'])
    expect(turns[0].cited.map((passage) => passage.ref)).toEqual(['kc91b04', 'k7f3a91'])
  })

  it('does not count a reference the search never returned', () => {
    const [turn] = deriveTurns([user('q'), assistant(search(RESULT), text('Sixty days [kdeadbe].'))], false)
    expect(turn.cited).toEqual([])
  })

  it('is searching while a call has no result, and while no text has come', () => {
    const [running] = deriveTurns([user('q'), assistant(search(undefined))], true)
    expect(running).toMatchObject({ phase: 'searching', searching: true, searches: 1 })
    const [found] = deriveTurns([user('q'), assistant(search(RESULT))], true)
    expect(found).toMatchObject({ phase: 'searching', searching: false })
  })

  it('is writing once text comes, and done when the turn ends', () => {
    const messages = [user('q'), assistant(search(RESULT), text('Sixty days'))]
    expect(deriveTurns(messages, true)[0].phase).toBe('writing')
    expect(deriveTurns(messages, false)[0].phase).toBe('done')
  })

  it('keeps each question apart and ignores the messages that only carry tool results', () => {
    const carrier = { role: 'user', content: [{ type: 'tool_result' }] }
    const turns = deriveTurns(
      [user('first'), assistant(search(RESULT), text('One [k7f3a91].')), carrier, user('second'), assistant(search('No results found for "x" across the available knowledge corpora.'), text('Nothing.'))],
      false
    )
    expect(turns.map((turn) => turn.question)).toEqual(['first', 'second'])
    expect(turns[0].cited).toHaveLength(1)
    expect(turns[1].passages).toEqual([])
    expect(turns[1].text).toBe('Nothing.')
  })

  it('marks a turn the chat could not complete as failed', () => {
    const failed = { role: 'user', status: 'error', content: [{ type: 'text', text: 'q' }] }
    const [turn] = deriveTurns([failed, assistant(text('The connection was lost.'))], false)
    expect(turn).toMatchObject({ phase: 'error', failed: true, text: 'The connection was lost.' })
  })

  it('lists an excerpt found by two searches once', () => {
    const [turn] = deriveTurns([user('q'), assistant(search(RESULT), search(RESULT), text('x'))], false)
    expect(turn.searches).toBe(2)
    expect(turn.passages).toHaveLength(2)
  })
})
