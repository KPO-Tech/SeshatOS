import { describe, expect, it } from 'vitest'
import type { Skill } from './skillsTypes'
import { filterSkills } from './useSkills'

function skill(overrides: Partial<Skill>): Skill {
  return { name: 'a', display_name: 'A', description: '', source: 'userSettings', collection: 'user', enabled: false, ...overrides } as Skill
}

const skills = [
  skill({ name: 'deploy', display_name: 'Deploy', description: 'Ship code', collection: 'gstack', enabled: true }),
  skill({ name: 'review', display_name: 'Review', description: 'Code review', collection: 'gstack' }),
  skill({ name: 'notes', display_name: 'Notes', description: 'Write notes', collection: 'user', enabled: true })
]

describe('filterSkills', () => {
  it('returns everything without filters', () => {
    expect(filterSkills(skills, { query: '', collection: 'all', enabledOnly: false })).toHaveLength(3)
  })

  it('matches name, display name and description, ignoring case', () => {
    expect(filterSkills(skills, { query: 'CODE', collection: 'all', enabledOnly: false }).map((s) => s.name)).toEqual(['deploy', 'review'])
  })

  it('narrows by collection and by enabled', () => {
    expect(filterSkills(skills, { query: '', collection: 'gstack', enabledOnly: true }).map((s) => s.name)).toEqual(['deploy'])
  })
})
