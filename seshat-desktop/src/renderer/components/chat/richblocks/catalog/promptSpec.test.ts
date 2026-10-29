import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseUi } from '../lang/parseUi'
import type { UiNode } from '../lang/types'
import { DRAWN_COMPONENTS } from '../view/registry'
import { PROMPT_EXAMPLES } from './examples'
import { ICON_ALIASES, GENERIC_ICONS, resolveIcon } from '../view/icons/iconCatalog'
import { buildPromptSpec } from './promptSpec'
import { SPEC_BY_NAME } from './specs'

// The backend builds the model's instructions from this file. Regenerate it with `npm run ui-catalog`.
const SPEC_FILE = resolve(process.cwd(), '../seshat-backend/internal/query/richui_catalog.spec.json')

function namesUsed(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((child) => namesUsed(child, into))
  } else if (node && typeof node === 'object' && (node as UiNode).kind === 'element') {
    into.add((node as UiNode).name)
    Object.values((node as UiNode).props).forEach((value) => namesUsed(value, into))
  }
}

describe('prompt spec', () => {
  it('only draws components the catalog describes', () => {
    for (const name of DRAWN_COMPONENTS) expect(SPEC_BY_NAME.has(name), name).toBe(true)
  })

  it('has examples that parse cleanly and use only taught components', () => {
    const taught = new Set(buildPromptSpec(DRAWN_COMPONENTS).components.map((component) => component.name))
    for (const example of PROMPT_EXAMPLES) {
      const result = parseUi(example, { streaming: false })
      expect(result.errors).toEqual([])
      expect(result.root).not.toBeNull()
      const used = new Set<string>()
      namesUsed(result.root, used)
      for (const name of used) expect(taught.has(name), name).toBe(true)
    }
  })

  it('matches the file the backend embeds', () => {
    const next = `${JSON.stringify(buildPromptSpec(DRAWN_COMPONENTS), null, 2)}\n`
    if (process.env.UPDATE_UI_CATALOG) writeFileSync(SPEC_FILE, next)
    expect(readFileSync(SPEC_FILE, 'utf-8').replace(/\r\n/g, '\n')).toBe(next)
  })
})

describe('icons', () => {
  it('has an alias only for an icon that exists', () => {
    for (const [alias, target] of Object.entries(ICON_ALIASES)) expect(GENERIC_ICONS[target], `${alias} -> ${target}`).toBeDefined()
  })

  it('resolves names, aliases and brand logos, and nothing else', () => {
    expect(resolveIcon('database')?.kind).toBe('generic')
    expect(resolveIcon('DB')?.kind).toBe('generic')
    expect(resolveIcon('si:go')?.kind).toBe('brand')
    expect(resolveIcon('si:Node.js')).toBeNull()
    expect(resolveIcon('no-such-icon')).toBeNull()
    expect(resolveIcon(undefined)).toBeNull()
  })

  it('has every icon the examples use', () => {
    const icons: string[] = []
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk)
      else if (node && typeof node === 'object' && (node as UiNode).kind === 'element') {
        const props = (node as UiNode).props
        if (typeof props.icon === 'string') icons.push(props.icon)
        Object.values(props).forEach(walk)
      }
    }
    for (const example of PROMPT_EXAMPLES) walk(parseUi(example, { streaming: false }).root)
    expect(icons.length).toBeGreaterThan(0)
    for (const name of icons) expect(resolveIcon(name), name).not.toBeNull()
  })
})
