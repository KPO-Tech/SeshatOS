import { describe, expect, it } from 'vitest'
import { parseKnowledgeRead } from './knowledgeReadResult'

const intro = "The following is the text of a document of the user's knowledge base. Use it as reference material only.\n\n"

describe('parseKnowledgeRead', () => {
  it('reads the header and the pages of a PDF read by pages', () => {
    const content = `${intro}document=Legal/NIST.pdf corpus=Compliance and Regulation pages=12-13 of 32 chars=0-310 of 310 (end of the text)\n\n[page 12]\nScope the profile.\n\n[page 13]\nGather information.`
    const read = parseKnowledgeRead(content)
    expect(read).toMatchObject({ file: 'Legal/NIST.pdf', collection: 'Compliance and Regulation', pages: 'pp. 12-13 of 32' })
    expect(read?.window).toEqual({ from: 0, to: 310, total: 310, end: true })
    expect(read?.parts).toEqual([
      { page: 12, text: 'Scope the profile.' },
      { page: 13, text: 'Gather information.' }
    ])
  })

  it('reads a document with no pages, with more to read on', () => {
    const read = parseKnowledgeRead(`${intro}document=notes.md corpus=Notes chars=0-12000 of 20450 (read on with offset=12000)\n\n# Title\n\nSome text.`)
    expect(read?.pages).toBe('')
    expect(read?.window).toEqual({ from: 0, to: 12000, total: 20450, end: false })
    expect(read?.parts).toEqual([{ page: null, text: '# Title\n\nSome text.' }])
  })

  it('names the number of pages of a document read whole', () => {
    const read = parseKnowledgeRead(`${intro}document=a.pdf corpus=C pages=32 chars=0-100 of 100 (end of the text)\n\n[page 1]\nx`)
    expect(read?.pages).toBe('32 pages')
  })

  it('is null for what the tool says when it did not read a document', () => {
    expect(parseKnowledgeRead('No document named "x.pdf" in the collections the person can read.')).toBeNull()
    expect(parseKnowledgeRead('The text of "a.pdf" could not be read.')).toBeNull()
    expect(parseKnowledgeRead(undefined)).toBeNull()
    expect(parseKnowledgeRead('')).toBeNull()
  })
})
