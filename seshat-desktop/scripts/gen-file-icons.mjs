// Regenerates the file and folder icons of the project files tree and of the chat's "files changed" list.
//
//   npm i --no-save material-icon-theme
//   node scripts/gen-file-icons.mjs
//
// It copies a hand-picked set of SVGs from Material Icon Theme (MIT, PKief, https://github.com/material-extensions/vscode-material-icon-theme)
// into src/renderer/assets/file-icons/ and writes src/renderer/lib/fileIconMap.ts, the maps from a file name, an extension or a folder name
// to one of those icons. The theme is 1,200 icons: only the kinds a software project holds are copied. The set is chosen by icon, not by
// name: every file name, extension and folder name of the theme that leads to a chosen icon is mapped, so "tsconfig.node.json" and
// "vitest.config.ts" are found without being listed here.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const themeDir = dirname(require.resolve('material-icon-theme/package.json'))
const theme = JSON.parse(readFileSync(join(themeDir, 'dist/material-icons.json'), 'utf8'))

const EXTENSIONS = [
  'py', 'pyi', 'ipynb', 'ts', 'tsx', 'd.ts', 'test.ts', 'spec.ts', 'test.tsx', 'spec.tsx', 'test.js', 'spec.js', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'jsonc', 'json5', 'md', 'mdx', 'markdown', 'txt', 'pdf', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'go', 'rs', 'java', 'kt',
  'kts', 'swift', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'rb', 'php', 'lua', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd', 'sql',
  'yaml', 'yml', 'toml', 'ini', 'conf', 'env', 'xml', 'svg', 'csv', 'tsv', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt', 'rtf', 'png',
  'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'mp4', 'mov', 'webm', 'mp3', 'wav', 'ogg', 'flac', 'zip', 'tar', 'gz', 'tgz', '7z',
  'rar', 'log', 'lock', 'vue', 'svelte', 'astro', 'tex', 'r', 'proto', 'graphql', 'gql', 'tf', 'tfvars', 'dart', 'scala', 'ex', 'exs',
  'zig', 'wasm', 'prisma', 'sol', 'nix', 'hs', 'clj', 'elm', 'jl', 'pl', 'vim', 'diff', 'patch', 'map', 'pem', 'crt', 'exe', 'dll',
  'woff', 'woff2', 'ttf', 'otf', 'http', 'sqlite', 'db', 'txt'
]
const FILE_NAMES = [
  'Dockerfile', 'Makefile', '.gitignore', '.gitattributes', '.gitmodules', '.mailmap', 'package.json', 'package-lock.json', 'pnpm-lock.yaml',
  'yarn.lock', 'tsconfig.json', 'go.mod', 'go.sum', 'go.work', 'Cargo.toml', 'Cargo.lock', 'LICENSE', 'README.md', '.env', '.env.example',
  'docker-compose.yml', 'AGENTS.md', 'CLAUDE.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', '.npmrc',
  '.editorconfig', '.prettierrc', '.eslintrc.json', 'eslint.config.js', 'vite.config.ts', 'vitest.config.ts', 'tailwind.config.js',
  'jest.config.js', 'playwright.config.ts', '.golangci.yml', 'CODEOWNERS', 'requirements.txt', 'pyproject.toml', 'Gemfile'
]
// Icons that no extension above leads to but that name a tool the files of a project belong to.
const EXTRA_ICONS = [
  'vitest', 'vite', 'tsconfig', 'npm', 'nodejs', 'eslint', 'prettier', 'tailwindcss', 'editorconfig', 'git', 'docker', 'jest', 'playwright',
  'webpack', 'rollup', 'babel', 'postcss', 'vercel', 'netlify', 'firebase', 'prisma', 'github-actions-workflow', 'contributing', 'changelog',
  'license', 'readme', 'email', 'tune', 'lock', 'key', 'certificate', 'console', 'robot', 'claude', 'gemini-ai', 'copilot', 'todo'
]
const FOLDER_NAMES = [
  'src', 'source', 'docs', 'doc', 'documentation', 'scripts', 'script', 'test', 'tests', '__tests__', 'spec', 'e2e', 'mocks', 'fixtures',
  '.github', '.githooks', '.vscode', '.idea', '.claude', 'node_modules', 'dist', 'build', 'out', 'public', 'static', 'assets', 'images', 'img',
  'icons', 'fonts', 'lib', 'libs', 'components', 'pages', 'views', 'hooks', 'utils', 'helpers', 'config', 'configs', 'cmd', 'internal', 'pkg',
  'api', 'app', 'bin', 'data', 'database', 'db', 'migrations', 'models', 'services', 'styles', 'css', 'types', 'vendor', 'tmp', 'temp',
  'private', 'website', 'resources', 'shared', 'examples', 'docker', 'logs', 'store', 'stores', 'routes', 'router', 'middleware',
  'plugins', 'tools', 'themes', 'locales', 'i18n', 'security', 'target', 'coverage', '.cache', 'workflows', 'ci', 'ui', 'layout', 'core',
  'common', 'server', 'client', 'backend', 'frontend', 'web', 'mobile', 'desktop', 'cli', 'tui', 'agents', 'skills', 'prompts', 'tasks',
  'jobs', 'queue', 'cache', 'storage', 'files', 'uploads', 'content', 'draft', 'archive', 'backup', 'secrets', 'env', 'venv', '.venv',
  'python', 'rust', 'go', 'java', 'kubernetes', 'k8s', 'terraform', 'ansible', 'github', 'gitlab', 'sandbox', 'benchmark', 'bench'
]

const outDir = join(process.cwd(), 'src/renderer/assets/file-icons')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const known = (icon) => icon && theme.iconDefinitions[icon]
const used = new Set(['file', 'folder', 'folder-open'])

// The icons chosen, by the extensions and names listed and by the tools above.
const chosen = new Set(EXTRA_ICONS.filter(known))
for (const ext of EXTENSIONS) {
  const icon = theme.fileExtensions[ext] ?? theme.languageIds?.[ext]
  if (known(icon)) chosen.add(icon)
}
for (const name of FILE_NAMES) {
  const icon = theme.fileNames[name] ?? theme.fileNames[name.toLowerCase()]
  if (known(icon)) chosen.add(icon)
}

// Every extension and file name of the theme that leads to a chosen icon.
const byExtension = {}
const byName = {}
for (const [ext, icon] of Object.entries(theme.fileExtensions)) {
  if (chosen.has(icon)) byExtension[ext.toLowerCase()] = icon
}
for (const [ext, icon] of Object.entries(theme.languageIds ?? {})) {
  if (chosen.has(icon) && !byExtension[ext.toLowerCase()]) byExtension[ext.toLowerCase()] = icon
}
for (const [name, icon] of Object.entries(theme.fileNames)) {
  if (chosen.has(icon)) byName[name.toLowerCase()] = icon
}
for (const icon of chosen) used.add(icon)

// A folder icon has an open one named after it (folder-src and folder-src-open): the map keeps the closed one.
const byFolder = {}
const chosenFolders = new Set()
for (const name of FOLDER_NAMES) {
  const closed = theme.folderNames[name]
  if (!known(closed) || theme.folderNamesExpanded[name] !== `${closed}-open` || !known(`${closed}-open`)) continue
  byFolder[name] = closed
  chosenFolders.add(closed)
}
for (const closed of chosenFolders) {
  used.add(closed)
  used.add(`${closed}-open`)
}

for (const icon of used) {
  const def = theme.iconDefinitions[icon]
  if (!def) throw new Error(`no definition for ${icon}`)
  copyFileSync(join(themeDir, 'dist', def.iconPath), join(outDir, `${icon}.svg`))
}

copyFileSync(join(themeDir, 'LICENSE'), join(outDir, 'LICENSE.material-icon-theme.txt'))

const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(join(process.cwd(), 'src/renderer/lib/fileIconMap.ts'),
`// Generated by scripts/gen-file-icons.mjs from Material Icon Theme (MIT). Do not edit by hand.

export const ICON_BY_EXTENSION: Record<string, string> = ${JSON.stringify(sorted(byExtension), null, 2)}

export const ICON_BY_FILE_NAME: Record<string, string> = ${JSON.stringify(sorted(byName), null, 2)}

/** The closed icon of a folder by its name; its open one is the same name followed by "-open". */
export const ICON_BY_FOLDER_NAME: Record<string, string> = ${JSON.stringify(sorted(byFolder), null, 2)}

export const DEFAULT_FILE_ICON = 'file'
export const DEFAULT_FOLDER_ICON = 'folder'
`)
console.log(`${used.size} icons, ${Object.keys(byExtension).length} extensions, ${Object.keys(byName).length} file names, ${Object.keys(byFolder).length} folder names`)
