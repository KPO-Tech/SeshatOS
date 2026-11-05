import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// The tool is run as a person runs it, on a small project of its own: the catalogues and the code of the real one are not touched.
const SCRIPT = join(process.cwd(), 'scripts/i18n-scan.mjs')

let repo: string
let root: string

function write(path: string, text: string) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

const renderer = () => join(root, 'src/renderer')
const catalog = (language: string) => JSON.parse(readFileSync(join(renderer(), `i18n/locales/${language}/demo.json`), 'utf8'))

function scan(mode: 'check' | 'sync', ...extra: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, mode, '--root', root, ...extra], { encoding: 'utf8' })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'i18n-scan-'))
  root = join(repo, 'seshat-desktop')
  write(join(renderer(), 'i18n/locales/en/demo.json'), JSON.stringify({ greeting: 'Hello', nested: { one: 'One' } }))
  write(join(renderer(), 'i18n/locales/fr/demo.json'), JSON.stringify({ greeting: 'Bonjour', nested: { one: 'Un' } }))
  write(join(renderer(), 'Demo.tsx'), "const { t } = useTranslation('demo')\nexport const a = [t('greeting'), t('nested.one')]\n")
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('i18n:check', () => {
  it('reports nothing when the code and the catalogues agree', () => {
    const { code, out } = scan('check')
    expect(out).toContain('Nothing to report')
    expect(code).toBe(0)
  })

  it('finds a key added by hand in the code, and says where', () => {
    write(join(renderer(), 'Demo.tsx'), "const { t } = useTranslation('demo')\nexport const a = [t('greeting'), t('nested.one'), t('farewell')]\n")
    const { code, out } = scan('check')
    expect(code).toBe(1)
    expect(out).toContain('demo:farewell')
    expect(out).toContain('src/renderer/Demo.tsx:2')
  })

  it('finds a key nothing uses', () => {
    write(join(renderer(), 'Demo.tsx'), "const { t } = useTranslation('demo')\nexport const a = t('greeting')\n")
    const { code, out } = scan('check')
    expect(code).toBe(1)
    expect(out).toContain('demo:nested.one')
  })

  it('finds a difference between two languages', () => {
    write(join(renderer(), 'i18n/locales/fr/demo.json'), JSON.stringify({ greeting: 'Bonjour' }))
    const { code, out } = scan('check')
    expect(code).toBe(1)
    expect(out).toMatch(/fr\/demo\s+missing\s+nested\.one/)
  })

  it('reads a key written out in a table of data, with its namespace', () => {
    write(join(renderer(), 'Table.ts'), "export const rows = [{ labelKey: 'demo:greeting' }, { labelKey: 'demo:nested.one' }]\n")
    write(join(renderer(), 'Demo.tsx'), 'export const nothing = 1\n')
    expect(scan('check').code).toBe(0)
  })

  it('counts a key with plural forms as used by its base name', () => {
    write(join(renderer(), 'i18n/locales/en/demo.json'), JSON.stringify({ days_one: '{{count}} day', days_other: '{{count}} days' }))
    write(join(renderer(), 'i18n/locales/fr/demo.json'), JSON.stringify({ days_one: '{{count}} jour', days_other: '{{count}} jours' }))
    write(join(renderer(), 'Demo.tsx'), "const { t } = useTranslation('demo')\nexport const a = t('days', { count: 2 })\n")
    expect(scan('check').code).toBe(0)
  })

  it('refuses a key built from pieces, which it cannot check', () => {
    write(join(renderer(), 'Demo.tsx'), "const { t } = useTranslation('demo')\nexport const a = [t('greeting'), t('nested.one'), t(`x.${name}`)]\n")
    const { code, out } = scan('check')
    expect(code).toBe(1)
    expect(out).toContain('built from pieces')
  })
})

describe('i18n:sync', () => {
  it('adds a key used with a default text to English, and the English text to the other languages', () => {
    write(join(renderer(), 'Demo.tsx'), "const { t } = useTranslation('demo')\nexport const a = [t('greeting'), t('nested.one'), t('farewell', 'Goodbye')]\n")
    expect(scan('check').code).toBe(1)
    expect(scan('sync').code).toBe(0)
    expect(catalog('en').farewell).toBe('Goodbye')
    expect(catalog('fr').farewell).toBe('Goodbye')
    expect(catalog('fr').greeting).toBe('Bonjour')
    expect(scan('check').code).toBe(0)
  })

  it('fills a key a language lacks with the English text, and keeps what it has', () => {
    write(join(renderer(), 'i18n/locales/fr/demo.json'), JSON.stringify({ greeting: 'Salut' }))
    expect(scan('sync').code).toBe(0)
    expect(catalog('fr')).toEqual({ greeting: 'Salut', nested: { one: 'One' } })
  })

  it('does not invent the English text of a key the code uses without one', () => {
    write(join(renderer(), 'Demo.tsx'), "const { t } = useTranslation('demo')\nexport const a = [t('greeting'), t('nested.one'), t('farewell')]\n")
    const { code, out } = scan('sync')
    expect(code).toBe(1)
    expect(out).toContain('demo:farewell')
    expect(catalog('en').farewell).toBeUndefined()
  })
})

describe('the paths a model reads', () => {
  it('skips a protected file, whatever it holds', () => {
    write(join(renderer(), 'systemPrompt.ts'), "export const a = t('demo:neverTranslated')\n")
    const { code, out } = scan('check')
    expect(out).toContain('1 protected file(s) skipped')
    expect(code).toBe(0)
  })

  it('refuses to run on a protected file named on the command line', () => {
    write(join(renderer(), 'agentInstructions.ts'), 'export const a = 1\n')
    const { code, out } = scan('check', join(renderer(), 'agentInstructions.ts'))
    expect(code).toBe(2)
    expect(out).toContain('refused')
  })

  it('refuses to run on the runtime', () => {
    write(join(repo, 'seshat-runtime/internal/prompt/base.go'), 'package prompt\n')
    const { code, out } = scan('check', join(repo, 'seshat-runtime/internal/prompt/base.go'))
    expect(code).toBe(2)
    expect(out).toContain('refused')
  })

  it('refuses to run on the instructions of the knowledge agent', () => {
    const file = join(repo, 'seshat-backend/internal/knowledge/agent/loop.go')
    write(file, 'package agent\n')
    expect(scan('check', file).code).toBe(2)
  })
})

describe('the real project', () => {
  it('has nothing to report', () => {
    const out = execFileSync(process.execPath, [SCRIPT, 'check'], { encoding: 'utf8' })
    expect(out).toContain('Nothing to report')
  }, 60_000)
})
