import { describe, expect, it } from 'vitest'
import type { LocalConnector } from './api/localConnectorsApi'
import { categoryLabel, groupConnectors, matchesQuery } from './connectorGroups'

function connector(kind: string, category: string, overrides: Partial<LocalConnector> = {}): LocalConnector {
  return {
    kind, label: kind.toUpperCase(), description: `${kind} connector`, category, credential_label: 'Key',
    status: 'disconnected', tools: [], ...overrides
  }
}

describe('groupConnectors', () => {
  it('groups by category in the order the backend lists them', () => {
    const groups = groupConnectors([connector('github', 'productivity'), connector('stripe', 'payments'), connector('linear', 'productivity')])
    expect(groups.map((group) => group.id)).toEqual(['productivity', 'payments'])
    expect(groups[0].connectors.map((item) => item.kind)).toEqual(['github', 'linear'])
    expect(groups[0].label).toBe('Work management')
  })

  it('returns nothing for no connector', () => {
    expect(groupConnectors([])).toEqual([])
  })
})

describe('categoryLabel', () => {
  it('names a category the desktop does not know after the category itself', () => {
    expect(categoryLabel('devtools')).toBe('Devtools')
  })
})

describe('matchesQuery', () => {
  it('matches the label or the description without regard to case', () => {
    const github = connector('github', 'productivity', { label: 'GitHub', description: 'Manage pull requests' })
    expect(matchesQuery(github, 'GITHUB')).toBe(true)
    expect(matchesQuery(github, 'pull')).toBe(true)
    expect(matchesQuery(github, 'stripe')).toBe(false)
    expect(matchesQuery(github, '  ')).toBe(true)
  })
})
