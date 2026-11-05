// Reports the translations that run much longer than their English text, so the screens are not stretched by them.
//   node scripts/i18n-length.mjs [--strict]
// A short text (60 characters of English or less: a label, a button, a title) should not be more than 30% longer in another language,
// unless the difference is a few letters. It is a warning; with --strict the exit code is 1 when one is found.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = join(here, '../src/renderer/i18n/locales')
const SOURCE = 'en'
const SHORT = 60
const RATIO = 1.3
const SLACK = 6

function flatten(object, prefix = '') {
  const out = {}
  for (const [key, value] of Object.entries(object)) {
    if (value !== null && typeof value === 'object') Object.assign(out, flatten(value, `${prefix}${key}.`))
    else out[`${prefix}${key}`] = String(value)
  }
  return out
}

function catalogs(language) {
  const root = join(localesDir, language)
  const found = {}
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.json')) found[relative(root, path).split(sep).join('/').slice(0, -'.json'.length)] = flatten(JSON.parse(readFileSync(path, 'utf8')))
    }
  }
  if (existsSync(root)) walk(root)
  return found
}

const source = catalogs(SOURCE)
const languages = readdirSync(localesDir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== SOURCE).map((e) => e.name)
let total = 0
for (const language of languages) {
  const own = catalogs(language)
  const long = []
  let sourceChars = 0
  let ownChars = 0
  for (const [namespace, keys] of Object.entries(source)) {
    for (const [key, english] of Object.entries(keys)) {
      const text = own[namespace]?.[key]
      if (text === undefined) continue
      sourceChars += english.length
      ownChars += text.length
      if (english.length <= SHORT && text.length > english.length * RATIO && text.length - english.length >= SLACK) long.push({ namespace, key, english, text })
    }
  }
  console.log(`${language}: ${(ownChars / Math.max(1, sourceChars)).toFixed(2)} times the length of English over all texts, ${long.length} short text(s) over the limit`)
  for (const item of long) console.log(`  ${item.namespace}:${item.key}  "${item.english}" (${item.english.length}) -> "${item.text}" (${item.text.length})`)
  total += long.length
}
if (process.argv.includes('--strict') && total > 0) process.exit(1)
