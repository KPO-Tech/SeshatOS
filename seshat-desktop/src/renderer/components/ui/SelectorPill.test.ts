import { describe, expect, it } from 'vitest'
import { filterSelectorOptions, type SelectorOption } from './SelectorPill'

const options: SelectorOption[] = [
  { id: '1', label: 'GLM 5.1', description: 'Z.AI' },
  { id: '2', label: 'Claude Sonnet', description: 'Anthropic' },
  { id: '3', label: 'gpt-5', description: 'OpenAI' }
]

describe('filterSelectorOptions', () => {
  it('returns every option for an empty query', () => {
    expect(filterSelectorOptions(options, '  ')).toBe(options)
  })

  it('matches the label or the description without regard to case', () => {
    expect(filterSelectorOptions(options, 'glm').map((o) => o.id)).toEqual(['1'])
    expect(filterSelectorOptions(options, 'ANTHROPIC').map((o) => o.id)).toEqual(['2'])
  })

  it('returns nothing when no option matches', () => {
    expect(filterSelectorOptions(options, 'zzz')).toEqual([])
  })
})
