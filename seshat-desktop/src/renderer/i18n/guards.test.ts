import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isProtectedPath } from '../../../scripts/i18n-scan.mjs'

// Two guards against drift. Without them the first contribution made in good faith breaks the rule without a sound:
//   1. every language has exactly the keys of English;
//   2. no translation call under a path a model reads (see docs/I18N.md).

type Catalog = Record<string, unknown>

function flatten(object: Catalog, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) =>
    value !== null && typeof value === 'object' ? flatten(value as Catalog, `${prefix}${key}.`) : [`${prefix}${key}`]
  )
}

/** The keys one catalogue has and the other does not, in both directions. */
export function keyDifferences(source: Catalog, other: Catalog): { missing: string[]; extra: string[] } {
  const wanted = new Set(flatten(source))
  const have = new Set(flatten(other))
  return { missing: [...wanted].filter((key) => !have.has(key)), extra: [...have].filter((key) => !wanted.has(key)) }
}

const modules = import.meta.glob<Catalog>('./locales/**/*.json', { eager: true, import: 'default' })

function catalogs(): Record<string, Record<string, Catalog>> {
  const out: Record<string, Record<string, Catalog>> = {}
  for (const [path, catalog] of Object.entries(modules)) {
    const [, language, file] = /^\.\/locales\/([^/]+)\/(.+)\.json$/.exec(path) ?? []
    if (!language) continue
    out[language] ??= {}
    out[language][file] = catalog
  }
  return out
}

describe('parity of the catalogues', () => {
  const all = catalogs()
  const languages = Object.keys(all)

  it('has English and at least one other language', () => {
    expect(languages).toContain('en')
    expect(languages.length).toBeGreaterThan(1)
  })

  it.each(languages.filter((language) => language !== 'en'))('%s has the namespaces and the keys of English, and nothing else', (language) => {
    expect(Object.keys(all[language]).sort()).toEqual(Object.keys(all.en).sort())
    for (const namespace of Object.keys(all.en)) {
      const { missing, extra } = keyDifferences(all.en[namespace], all[language][namespace] ?? {})
      expect({ namespace, missing, extra }).toEqual({ namespace, missing: [], extra: [] })
    }
  })

  it('sees a key that one side has alone', () => {
    expect(keyDifferences({ a: 'A', b: { c: 'C' } }, { a: 'A' })).toEqual({ missing: ['b.c'], extra: [] })
    expect(keyDifferences({ a: 'A' }, { a: 'A', z: 'Z' })).toEqual({ missing: [], extra: ['z'] })
    expect(keyDifferences({ a: 'A', b: { c: 'C' } }, { a: 'A', b: { c: 'C' } })).toEqual({ missing: [], extra: [] })
  })

  it('has no empty text', () => {
    for (const [language, namespaces] of Object.entries(all)) {
      for (const [namespace, catalog] of Object.entries(namespaces)) {
        const flat = Object.fromEntries(flatten(catalog).map((key) => [key, key.split('.').reduce((node: unknown, part) => (node as Catalog)[part], catalog)]))
        for (const [key, value] of Object.entries(flat)) expect(String(value).trim(), `${language}/${namespace}:${key}`).not.toBe('')
      }
    }
  })
})

// ── No translation under the paths a model reads ────────────────────────────

const TRANSLATION_CALL = /\b(?:i18n|i18next)\.t\(|(?<![\w.$])t\(\s*['"`]|\buseTranslation\b|from ['"](?:react-i18next|i18next)['"]|from ['"]@renderer\/i18n/

/** The files that are on a protected path and make a translation call. */
export function violations(files: Array<{ path: string; text: string }>): string[] {
  return files.filter((file) => isProtectedPath(file.path) && TRANSLATION_CALL.test(file.text)).map((file) => file.path)
}

const CODE = /\.(?:ts|tsx|js|mjs|cjs|go)$/
const SKIPPED = new Set(['node_modules', 'dist', 'out', '.tmp', 'bin', '.git', 'locales'])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) walk(join(dir, entry.name), out)
    } else if (CODE.test(entry.name)) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

describe('no translation under the paths a model reads', () => {
  const repo = join(process.cwd(), '..')
  const files = [join(repo, 'seshat-desktop/src'), join(repo, 'seshat-desktop/scripts'), join(repo, 'seshat-backend')]
    .flatMap((dir) => walk(dir))
    .map((file) => ({ path: relative(repo, file).split(sep).join('/'), file }))

  it('has protected files to look at, so that this guard is not empty', () => {
    expect(files.filter((entry) => isProtectedPath(entry.path)).length).toBeGreaterThan(3)
  })

  it('finds none in the project', () => {
    const found = violations(files.filter((entry) => isProtectedPath(entry.path)).map((entry) => ({ path: entry.path, text: readFileSync(entry.file, 'utf8') })))
    expect(found).toEqual([])
  })

  it('catches a call in a file named for a prompt, an instruction or the catalogue of blocks', () => {
    const call = "import { useTranslation } from 'react-i18next'\nconst x = t('settings:a.b')\n"
    expect(violations([{ path: 'seshat-desktop/src/renderer/lib/systemPrompt.ts', text: call }])).toHaveLength(1)
    expect(violations([{ path: 'seshat-desktop/src/renderer/agentInstructions.ts', text: "i18next.t('a')" }])).toHaveLength(1)
    expect(violations([{ path: 'seshat-desktop/src/renderer/components/chat/richblocks/catalog/specs.ts', text: "t('x')" }])).toHaveLength(1)
    expect(violations([{ path: 'seshat-backend/internal/knowledge/agent/prompt.go', text: 'x := t("a")' }])).toHaveLength(1)
    expect(violations([{ path: 'seshat-runtime/internal/prompt/base.go', text: "t('a')" }])).toHaveLength(1)
  })

  it('leaves the ordinary files alone', () => {
    expect(violations([{ path: 'seshat-desktop/src/renderer/components/settings/AboutSettings.tsx', text: "const { t } = useTranslation('settings')" }])).toEqual([])
  })
})
