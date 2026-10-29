import { describe, expect, it } from 'vitest'
import { askExtras } from './askExtras'

const RESULT = '[1] ref=k7f3a91 score=0.8123 corpus=Legal file=Contract.docx pages=12\nThe annual amount is 10.\n'

const question = (text: string) => ({ role: 'user', content: [{ type: 'text', text }] })
const search = (content?: string) => ({ role: 'assistant', content: [{ type: 'tool_use', name: 'knowledge_search', _result: content ? { content, metadata: { corpora_searched: 2 } } : undefined }] })
const answer = (text: string) => ({ role: 'assistant', content: [{ type: 'text', text }] })

describe('askExtras', () => {
  it('turns a citation of a passage the turn found into a link, and drops one it did not', () => {
    const extras = askExtras([question('amount?'), search(RESULT), answer('It is 10 [k7f3a91] or 12 [kffffff].')], null, () => {})
    expect(extras[1]?.prepare?.('It is 10 [k7f3a91] or 12 [kffffff].')).toBe('It is 10 [•](#cite-k7f3a91) or 12.')
  })

  it('puts the documents under the message that ends the turn only', () => {
    const extras = askExtras([question('amount?'), search(RESULT), answer('It is 10 [k7f3a91].')], null, () => {})
    expect(extras[0]).toBeUndefined()
    expect(extras[1]?.footer).toBeUndefined()
    expect(extras[2]?.footer).toBeDefined()
  })

  it('has no footer for a turn that did not search', () => {
    const extras = askExtras([question('hello'), answer('Hello.')], null, () => {})
    expect(extras[1]?.footer).toBeUndefined()
  })

  it('does not carry the passages of one question into the next', () => {
    const extras = askExtras([question('a'), search(RESULT), answer('A [k7f3a91]'), question('b'), answer('B [k7f3a91]')], null, () => {})
    expect(extras[4]?.prepare?.('B [k7f3a91]')).toBe('B')
  })
})
