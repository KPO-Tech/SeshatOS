import { describe, expect, it } from 'vitest'
import { categoryOf, iconFor, tagsFor } from './skillIcons'

const skill = (name: string, description = '') => ({ name, description })

describe('iconFor', () => {
  it('reads the topic of a skill from its name and its description', () => {
    expect(iconFor(skill('git-assistant', 'Work with Git repositories, manage branches and commits.'))).toBe('git')
    expect(iconFor(skill('sql-assistant', 'Query and analyze databases (PostgreSQL, MySQL, SQLite).'))).toBe('database')
    expect(iconFor(skill('web-search', 'Search the web for up-to-date information.'))).toBe('web')
    expect(iconFor(skill('file-operations', 'Read, write, organize and analyze files in your local workspace.'))).toBe('files')
    expect(iconFor(skill('data-visualization', 'Create beautiful charts from your data.'))).toBe('data')
  })

  it('does not take the end of a word for a word', () => {
    expect(categoryOf(skill('pretty-page', 'Makes html look nice'))).not.toBe('AI and learning')
  })

  it('gives a skill that fits no topic the same icon every time', () => {
    const first = iconFor(skill('zzz-quux', 'Lorem'))
    expect(iconFor(skill('zzz-quux', 'Lorem'))).toBe(first)
    expect(['bolt', 'magic', 'tool', 'star', 'key']).toContain(first)
  })

  it('prefers the icon the person chose, when it is one that exists', () => {
    expect(iconFor(skill('git-assistant'), 'audio')).toBe('audio')
    expect(iconFor(skill('git-assistant'), 'nonsense')).toBe('git')
  })
})

describe('tagsFor', () => {
  it('lists up to three words the skill uses, in its own order', () => {
    expect(tagsFor(skill('python-analysis', 'Execute Python code, analyze data, create visualizations and more.'))).toEqual(['python', 'analysis', 'code'])
  })

  it('gives nothing for a skill that says nothing', () => {
    expect(tagsFor(skill('zzz', ''))).toEqual([])
  })
})
