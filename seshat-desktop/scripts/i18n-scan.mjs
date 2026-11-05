// Keeps the catalogues of the interface in step with the code. See docs/I18N.md.
//
//   npm run i18n:check   lists the keys the code uses and the catalogue lacks, the keys nothing uses, and the keys one language
//                        has and another does not. It exits with 1 when there is anything to report.
//   npm run i18n:sync    adds to every language the keys the English one has and it lacks, with the English text as value (to be
//                        translated), and adds to English the keys the code uses with a default text: t('key', 'English text').
//
// What it reads: the .ts and .tsx files of src/renderer, with the TypeScript compiler. A key is the first argument of t(...) or
// i18n.t(...), read in the namespace of the useTranslation('namespace') of the same file; or, anywhere, a string written
// 'namespace:path.to.key' for a namespace that exists (the tables of data keep their keys that way).
//
// What it never reads: the paths that carry text a model reads (prompts, agent instructions, the runtime). It skips them, and it
// refuses to run when one of them is named on the command line. Only what a person reads is translated, never what a machine reads.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const SOURCE_LANGUAGE = 'en'
const DEFAULT_NAMESPACE = 'common'
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const QUALIFIED_KEY = /^([a-z][A-Za-z0-9]*):([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)$/

// ── Protected paths ─────────────────────────────────────────────────────────

const PROTECTED_NAME = /prompt|systemprompt|instructions/i

/** Whether a path, written from the root of the repository with forward slashes, holds text a model reads. */
export function isProtectedPath(path) {
  const clean = path.split(sep).join('/').replace(/^\.\//, '')
  const parts = clean.split('/')
  if (parts.includes('seshat-runtime')) return true
  if (clean.startsWith('seshat-backend/internal/knowledge/agent/')) return true
  // The catalogue of the blocks the model is told it can draw (promptSpec.ts hands it to the model).
  if (clean.startsWith('seshat-desktop/src/renderer/components/chat/richblocks/catalog/')) return true
  return PROTECTED_NAME.test(parts[parts.length - 1])
}

// ── Catalogues ──────────────────────────────────────────────────────────────

function flatten(object, prefix = '') {
  const out = {}
  for (const [key, value] of Object.entries(object)) {
    if (value !== null && typeof value === 'object') Object.assign(out, flatten(value, `${prefix}${key}.`))
    else out[`${prefix}${key}`] = value
  }
  return out
}

function setPath(object, path, value) {
  const parts = path.split('.')
  let node = object
  for (const part of parts.slice(0, -1)) {
    if (node[part] === undefined || typeof node[part] !== 'object') node[part] = {}
    node = node[part]
  }
  node[parts[parts.length - 1]] = value
}

function readCatalogs(localesDir) {
  const languages = existsSync(localesDir) ? readdirSync(localesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : []
  const catalogs = {}
  for (const language of languages) {
    catalogs[language] = {}
    for (const file of readdirSync(join(localesDir, language)).filter((name) => name.endsWith('.json'))) {
      catalogs[language][file.slice(0, -'.json'.length)] = JSON.parse(readFileSync(join(localesDir, language, file), 'utf8'))
    }
  }
  return { languages, catalogs }
}

function writeCatalog(localesDir, language, namespace, object) {
  mkdirSync(join(localesDir, language), { recursive: true })
  writeFileSync(join(localesDir, language, `${namespace}.json`), `${JSON.stringify(object, null, 2)}\n`)
}

// ── Reading the code ────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(path, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$|\.d\.ts$/.test(entry.name)) {
      out.push(path)
    }
  }
  return out
}

const isStringLike = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)

/** The literal keys an expression can be: a string, or either branch of a condition. */
function literalKeys(node) {
  if (isStringLike(node)) return [node.text]
  if (ts.isParenthesizedExpression(node)) return literalKeys(node.expression)
  if (ts.isConditionalExpression(node)) return [...literalKeys(node.whenTrue), ...literalKeys(node.whenFalse)]
  return []
}

function defaultTextOf(call) {
  const second = call.arguments[1]
  if (!second) return undefined
  if (isStringLike(second)) return second.text
  if (ts.isObjectLiteralExpression(second)) {
    for (const property of second.properties) {
      if (ts.isPropertyAssignment(property) && property.name.getText() === 'defaultValue' && isStringLike(property.initializer)) return property.initializer.text
    }
  }
  return undefined
}

/** The keys one file uses, and the problems it has (a key built from pieces, a key whose namespace cannot be told). */
export function scanSource(file, text, namespaces) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const used = []
  const problems = []
  const fileNamespaces = new Set()
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1

  const collectNamespaces = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useTranslation') {
      const first = node.arguments[0]
      if (first && isStringLike(first)) fileNamespaces.add(first.text)
      if (first && ts.isArrayLiteralExpression(first)) for (const element of first.elements) if (isStringLike(element)) fileNamespaces.add(element.text)
    }
    ts.forEachChild(node, collectNamespaces)
  }
  collectNamespaces(sf)

  const resolveKey = (raw, node) => {
    const match = QUALIFIED_KEY.exec(raw)
    if (match && namespaces.has(match[1])) return { namespace: match[1], key: match[2] }
    if (raw.includes(':')) {
      problems.push({ file, line: lineOf(node), message: `"${raw}" names a namespace that does not exist` })
      return null
    }
    if (fileNamespaces.size > 1) {
      problems.push({ file, line: lineOf(node), message: `"${raw}" is read in a file with several namespaces: write it as namespace:${raw}` })
      return null
    }
    return { namespace: fileNamespaces.size === 1 ? [...fileNamespaces][0] : DEFAULT_NAMESPACE, key: raw }
  }

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isT = (ts.isIdentifier(callee) && callee.text === 't') || (ts.isPropertyAccessExpression(callee) && callee.name.text === 't')
      if (isT && node.arguments.length > 0) {
        const first = node.arguments[0]
        if (ts.isTemplateExpression(first)) {
          problems.push({ file, line: lineOf(node), message: 'a key built from pieces cannot be checked: write each key out' })
        } else {
          for (const raw of literalKeys(first)) {
            const resolved = resolveKey(raw, node)
            if (resolved) used.push({ ...resolved, defaultText: defaultTextOf(node), file, line: lineOf(node) })
          }
        }
      }
    } else if (ts.isJsxAttribute(node) && node.name.getText() === 'i18nKey' && node.initializer && isStringLike(node.initializer)) {
      const resolved = resolveKey(node.initializer.text, node)
      if (resolved) used.push({ ...resolved, file, line: lineOf(node) })
    } else if (isStringLike(node)) {
      // A key written out in a table of data: 'settings:sections.account.label'.
      const match = QUALIFIED_KEY.exec(node.text)
      if (match && namespaces.has(match[1]) && !(ts.isCallExpression(node.parent) && node.parent.arguments[0] === node)) {
        used.push({ namespace: match[1], key: match[2], file, line: lineOf(node) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { used, problems }
}

// ── The comparison ──────────────────────────────────────────────────────────

const baseKey = (key) => key.replace(PLURAL_SUFFIX, '')

export function compare({ languages, catalogs }, used) {
  const source = catalogs[SOURCE_LANGUAGE] ?? {}
  const flatSource = {}
  for (const [namespace, object] of Object.entries(source)) flatSource[namespace] = flatten(object)

  const usedBases = new Map()
  for (const entry of used) {
    const set = usedBases.get(entry.namespace) ?? new Set()
    set.add(entry.key)
    usedBases.set(entry.namespace, set)
  }

  const exists = (namespace, key) => {
    const flat = flatSource[namespace]
    if (!flat) return false
    return key in flat || Object.keys(flat).some((candidate) => PLURAL_SUFFIX.test(candidate) && baseKey(candidate) === key)
  }

  const missingInSource = []
  const seen = new Set()
  for (const entry of used) {
    const id = `${entry.namespace}:${entry.key}`
    if (seen.has(id) || exists(entry.namespace, entry.key)) continue
    seen.add(id)
    missingInSource.push(entry)
  }

  const orphans = []
  for (const [namespace, flat] of Object.entries(flatSource)) {
    const bases = usedBases.get(namespace) ?? new Set()
    for (const key of Object.keys(flat)) if (!bases.has(baseKey(key))) orphans.push({ namespace, key })
  }

  const otherLanguages = []
  for (const language of languages.filter((code) => code !== SOURCE_LANGUAGE)) {
    for (const namespace of Object.keys(source)) {
      const own = flatten(catalogs[language]?.[namespace] ?? {})
      for (const key of Object.keys(flatSource[namespace])) if (!(key in own)) otherLanguages.push({ language, namespace, key, kind: 'missing' })
      for (const key of Object.keys(own)) if (!(key in flatSource[namespace])) otherLanguages.push({ language, namespace, key, kind: 'extra' })
    }
    for (const namespace of Object.keys(catalogs[language] ?? {})) {
      if (!(namespace in source)) otherLanguages.push({ language, namespace, key: '(the whole namespace)', kind: 'extra' })
    }
  }
  return { missingInSource, orphans, otherLanguages }
}

// ── Running ─────────────────────────────────────────────────────────────────

function gather(root, explicitPaths) {
  const repoRoot = resolve(root, '..')
  const rendererDir = join(root, 'src/renderer')
  const localesDir = join(rendererDir, 'i18n/locales')
  const asRepoPath = (path) => relative(repoRoot, path).split(sep).join('/')

  for (const given of explicitPaths) {
    if (isProtectedPath(asRepoPath(resolve(given)))) {
      return { refused: given }
    }
  }
  const targets = explicitPaths.length > 0 ? explicitPaths.map((path) => resolve(path)) : [rendererDir]
  const files = targets.flatMap((target) => (/\.tsx?$/.test(target) ? [target] : walk(target)))
  const scanned = files.filter((file) => !isProtectedPath(asRepoPath(file)))
  const skipped = files.length - scanned.length

  const catalog = readCatalogs(localesDir)
  const namespaces = new Set(Object.keys(catalog.catalogs[SOURCE_LANGUAGE] ?? {}))
  const used = []
  const problems = []
  for (const file of scanned) {
    const result = scanSource(relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8'), namespaces)
    used.push(...result.used)
    problems.push(...result.problems)
  }
  return { localesDir, catalog, used, problems, scanned: scanned.length, skipped }
}

function printList(title, items, format) {
  if (items.length === 0) return
  console.log(`\n${title} (${items.length})`)
  for (const item of items.slice(0, 80)) console.log(`  ${format(item)}`)
  if (items.length > 80) console.log(`  ... and ${items.length - 80} more`)
}

export function run(argv, cwd = process.cwd()) {
  const args = argv.slice()
  const mode = args.shift()
  let root = cwd
  const rootAt = args.indexOf('--root')
  if (rootAt >= 0) {
    root = resolve(args[rootAt + 1])
    args.splice(rootAt, 2)
  }
  if (mode !== 'check' && mode !== 'sync') {
    console.error('usage: node scripts/i18n-scan.mjs <check|sync> [--root dir] [paths...]')
    return 2
  }

  const gathered = gather(root, args)
  if (gathered.refused) {
    console.error(`refused: ${gathered.refused} holds text a model reads (a prompt, an agent instruction or the runtime), and that text is never translated.`)
    return 2
  }
  const { localesDir, catalog, used, problems, scanned, skipped } = gathered
  const result = compare(catalog, used)

  if (mode === 'sync') {
    const source = catalog.catalogs[SOURCE_LANGUAGE] ?? {}
    // The keys the code uses with a default text join the English catalogue.
    const cannot = []
    for (const entry of result.missingInSource) {
      if (entry.defaultText === undefined) {
        cannot.push(entry)
        continue
      }
      source[entry.namespace] ??= {}
      setPath(source[entry.namespace], entry.key, entry.defaultText)
      writeCatalog(localesDir, SOURCE_LANGUAGE, entry.namespace, source[entry.namespace])
    }
    // Every other language gets the English text for the keys it lacks.
    let added = 0
    for (const language of catalog.languages.filter((code) => code !== SOURCE_LANGUAGE)) {
      for (const namespace of Object.keys(source)) {
        const own = catalog.catalogs[language]?.[namespace] ?? {}
        const flatOwn = flatten(own)
        let changed = false
        for (const [key, value] of Object.entries(flatten(source[namespace]))) {
          if (key in flatOwn) continue
          setPath(own, key, value)
          added++
          changed = true
        }
        if (changed || !catalog.catalogs[language]?.[namespace]) writeCatalog(localesDir, language, namespace, own)
      }
    }
    console.log(`i18n:sync  ${added} key(s) added to the other languages with the English text${result.missingInSource.length - cannot.length > 0 ? `, ${result.missingInSource.length - cannot.length} added to English from the code` : ''}.`)
    printList('Used by the code, with no English text to add (write it in the English catalogue, or give a default: t(key, "text"))', cannot, (e) => `${e.namespace}:${e.key}  (${e.file}:${e.line})`)
    printList('Problems', problems, (p) => `${p.file}:${p.line}  ${p.message}`)
    if (result.orphans.length > 0) console.log(`\n${result.orphans.length} key(s) nothing uses are left in place: run i18n:check to list them.`)
    return cannot.length + problems.length > 0 ? 1 : 0
  }

  const total = result.missingInSource.length + result.orphans.length + result.otherLanguages.length + problems.length
  console.log(`i18n:check  ${scanned} file(s) read, ${skipped} protected file(s) skipped, ${used.length} key use(s).`)
  printList('Used by the code and missing from the English catalogue', result.missingInSource, (e) => `${e.namespace}:${e.key}  (${e.file}:${e.line})`)
  printList('In the English catalogue and used by nothing', result.orphans, (e) => `${e.namespace}:${e.key}`)
  printList('Differences between languages', result.otherLanguages, (e) => `${e.language}/${e.namespace}  ${e.kind}  ${e.key}`)
  printList('Problems', problems, (p) => `${p.file}:${p.line}  ${p.message}`)
  if (total === 0) console.log('Nothing to report.')
  return total === 0 ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2))
}
