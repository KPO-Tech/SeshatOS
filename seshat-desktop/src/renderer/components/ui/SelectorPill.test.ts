import { describe, expect, it } from 'vitest'
import { filterSelectorOptions, groupSelectorOptions, type SelectorOption } from './SelectorPill'

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

describe('groupSelectorOptions', () => {
  const models: SelectorOption[] = [
    { id: 'a', label: 'glm-5.1', group: 'zai', groupLabel: 'Z.ai' },
    { id: 'b', label: 'claude', group: 'or', groupLabel: 'OpenRouter' },
    { id: 'c', label: 'glm-5', group: 'zai', groupLabel: 'Z.ai' },
    { id: 'd', label: 'loose' }
  ]

  it('groups the options in the order the groups first appear, and leaves out an option with no group', () => {
    const groups = groupSelectorOptions(models)
    expect(groups.map((group) => [group.id, group.label, group.options.map((option) => option.id)])).toEqual([
      ['zai', 'Z.ai', ['a', 'c']],
      ['or', 'OpenRouter', ['b']]
    ])
  })

  it('names a group by its id when it has no label', () => {
    expect(groupSelectorOptions([{ id: 'x', label: 'x', group: 'local' }])[0].label).toBe('local')
  })
})
