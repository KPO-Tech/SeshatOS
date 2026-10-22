import { describe, expect, it } from 'vitest'
import type { ProviderChoice, ProviderSetting } from './providerTypes'
import { buildProviderRows, initialProviderForm, providerMenuItems } from './providerUtils'

function choice(id: string, overrides: Partial<ProviderChoice> = {}): ProviderChoice {
  return { id, name: id.toUpperCase(), auth_type: 'api_key', model_count: 3, main: false, ...overrides }
}

function setting(provider: string): ProviderSetting {
  return {
    id: `s-${provider}`, provider, name: provider, auth_kind: 'api_key', has_api_key: true, is_default: false,
    connection_status: 'ready', updated_at: 0
  }
}

const choices = [
  choice('anthropic', { main: true, name: 'Anthropic' }),
  choice('codex', { main: true, name: 'Codex', auth_type: 'oauth' }),
  choice('groq', { name: 'Groq' }),
  choice('openrouter', { name: 'OpenRouter' }),
  choice('zhipu', { name: 'Zhipu', unverified: true, base_url: 'https://example.test/v1' })
]

describe('buildProviderRows', () => {
  it('lists every main provider and only the configured others', () => {
    const rows = buildProviderRows(choices, [setting('groq')])
    expect(rows.map((row) => row.provider)).toEqual(['anthropic', 'codex', 'groq'])
    expect(rows[2].setting?.id).toBe('s-groq')
  })

  it('keeps a configured provider the catalog does not know', () => {
    const rows = buildProviderRows(choices, [setting('legacy-thing')])
    expect(rows.at(-1)?.provider).toBe('legacy-thing')
  })
})

describe('providerMenuItems', () => {
  it('shows the main providers and a collapsed "More providers" entry', () => {
    const items = providerMenuItems(choices, '', false)
    expect(items.map((item) => item.kind)).toEqual(['choice', 'choice', 'more'])
    expect(items[2]).toEqual({ kind: 'more', count: 3, expanded: false })
  })

  it('lists the others once expanded', () => {
    expect(providerMenuItems(choices, '', true)).toHaveLength(6)
  })

  it('searches both lists by name or id and opens the others by itself', () => {
    const items = providerMenuItems(choices, 'gro', false)
    const ids = items.flatMap((item) => (item.kind === 'choice' ? [item.choice.id] : []))
    expect(ids).toEqual(['groq'])
    expect(items.find((item) => item.kind === 'more')).toMatchObject({ expanded: true })
  })

  it('matches a main provider by id without opening the others', () => {
    const items = providerMenuItems(choices, 'cod', false)
    expect(items).toHaveLength(1)
  })

  it('returns nothing when no provider matches', () => {
    expect(providerMenuItems(choices, 'nope', false)).toEqual([])
  })
})

describe('initialProviderForm', () => {
  it('uses OAuth for Codex and no key for Ollama', () => {
    expect(initialProviderForm(choices[1]).auth_kind).toBe('oauth')
    expect(initialProviderForm(choice('ollama', { main: true, auth_type: 'none' })).base_url).toBe('http://localhost:11434')
  })

  it('shows an unverified provider address so it is confirmed, and leaves a verified one empty', () => {
    expect(initialProviderForm(choices[4]).base_url).toBe('https://example.test/v1')
    expect(initialProviderForm(choice('groq', { base_url: 'https://api.groq.test/v1' })).base_url).toBe('')
  })
})
