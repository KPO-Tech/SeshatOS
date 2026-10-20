import { CONNECTOR_KIND_LABELS, OAUTH_CONNECTOR_KINDS, STATIC_CONNECTOR_KINDS } from '@seshat/connector-catalog'
import { describe, expect, it } from 'vitest'
import { PLUGIN_CATALOG, availableSources, matchesQuery, pluginsFor } from './pluginCatalog'

describe('PLUGIN_CATALOG', () => {
  it('covers every kind of the shared connector catalog exactly once', () => {
    const kinds = [...OAUTH_CONNECTOR_KINDS, ...STATIC_CONNECTOR_KINDS]
    for (const kind of kinds) expect(PLUGIN_CATALOG.filter((plugin) => plugin.id === kind)).toHaveLength(1)
    expect(new Set(PLUGIN_CATALOG.map((plugin) => plugin.id)).size).toBe(PLUGIN_CATALOG.length)
  })

  it('labels each plugin from the shared catalog', () => {
    expect(PLUGIN_CATALOG.find((plugin) => plugin.id === 'gdrive')?.title).toBe(CONNECTOR_KIND_LABELS.gdrive)
  })

  it('gives Google Drive a local knowledge source and an organization account', () => {
    const drive = PLUGIN_CATALOG.find((plugin) => plugin.id === 'gdrive')!
    expect(drive.sources.map((source) => source.type)).toEqual(['knowledge', 'cloud-oauth'])
  })
})

describe('availableSources', () => {
  const drive = PLUGIN_CATALOG.find((plugin) => plugin.id === 'gdrive')!

  it('keeps organization connectors out of a local account', () => {
    expect(availableSources(drive, false).map((source) => source.type)).toEqual(['knowledge'])
    expect(availableSources(drive, true)).toHaveLength(2)
  })
})

describe('pluginsFor', () => {
  it('hides plugins that only exist as organization connectors on a local account', () => {
    const local = pluginsFor(false).map((plugin) => plugin.id)
    expect(local).toContain('gdrive')
    expect(local).not.toContain('gmail')
    expect(local).not.toContain('whatsapp')
    expect(local).not.toContain('stripe')
    expect(pluginsFor(true).map((plugin) => plugin.id)).toContain('stripe')
  })
})

describe('matchesQuery', () => {
  const plugin = PLUGIN_CATALOG.find((item) => item.id === 'github')!

  it('matches title and description, ignoring case', () => {
    expect(matchesQuery(plugin, 'GITHUB')).toBe(true)
    expect(matchesQuery(plugin, 'pull requests')).toBe(true)
    expect(matchesQuery(plugin, 'salesforce')).toBe(false)
  })

  it('matches everything on an empty query', () => {
    expect(matchesQuery(plugin, '  ')).toBe(true)
  })
})
