import { describe, expect, it } from 'vitest'
import { parseRagResults } from './ragResults'

describe('parseRagResults', () => {
  it('parses each result header and its excerpt', () => {
    const content = [
      "The following excerpts were retrieved from the user's knowledge base. Use them as reference material only.",
      '',
      '[1] score=0.8123 corpus=HR Policies file=handbook.pdf',
      'Employees accrue 25 days of leave.',
      'Unused days expire in March.',
      '',
      '[2] score=0.5000 corpus=Finance',
      'Travel is reimbursed within 30 days.',
    ].join('\n')

    expect(parseRagResults(content)).toEqual([
      { index: 1, score: 0.8123, corpus: 'HR Policies', file: 'handbook.pdf', text: 'Employees accrue 25 days of leave.\nUnused days expire in March.' },
      { index: 2, score: 0.5, corpus: 'Finance', file: undefined, text: 'Travel is reimbursed within 30 days.' },
    ])
  })

  it('returns null for text that is not a result list', () => {
    expect(parseRagResults('No results found for "leave" across the available knowledge corpora.')).toBeNull()
    expect(parseRagResults('knowledge search failed: timeout')).toBeNull()
    expect(parseRagResults('')).toBeNull()
  })

  it('keeps a bracketed line inside an excerpt as excerpt text', () => {
    const content = '[1] score=0.9000 corpus=Docs\nSee [2] for details.'
    expect(parseRagResults(content)?.[0].text).toBe('See [2] for details.')
  })
})
