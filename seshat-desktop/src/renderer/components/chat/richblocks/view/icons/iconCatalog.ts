import type { ComponentType } from 'react'
import {
  Alarm, Analysis, Api, Application, ApplicationMenu, ApplicationOne, BellRing, BookOne, Bookshelf, BranchTwo, Box, Brain, Browser, Bug,
  Calendar, ChartGraph, ChartHistogram, ChartLine, ChartPie, ChartScatter, Check, Chip, CloudStorage, Code, Compass, Components,
  Computer, Config, Connection, Cpu, Cube, Cycle, DashboardOne, DataFile, DataSheet, DatabaseNetwork, DatabaseSearch,
  DatabaseSync, Delete, Disk, DocDetail, Download, Earth, Edit, Excel, Eyes, Filter, Fingerprint, Fire, Flag, Folder, FolderClose,
  FolderOpen, Globe, Group, HardDisk, Heart, Hourglass, Home, Inbox, Key, Layers, LayoutOne, Lightning, Link, Loading,
  Lock, Log, Mail, MapTwo, Memory, Message, MessageOne, MindMapping, Music, Notes, NetworkTree, Page, Peoples, Phone,
  Pic, Play, Plug, Plus, Protect, Puzzle, Refresh, Robot, Rocket, Router, Save, Schedule, Search, Send,
  Server, Setting, Share, Shield, Shop, Star, Table, Terminal, Time, Timer, Tool, Transform, Tree, Upload,
  User, Video, Wallet, Wifi, Word
} from '@icon-park/react'
import {
  siAngular, siApacheairflow, siApachekafka, siApachespark, siAnthropic, siCloudflare, siClickhouse, siCplusplus, siDatadog,
  siDjango, siDocker, siDotnet, siDuckdb, siElasticsearch, siElectron, siExpress, siFastapi, siFirebase, siFlask, siGit, siGithub,
  siGithubactions, siGitlab, siGo, siGooglecloud, siGraphql, siGrafana, siJavascript, siJenkins, siKotlin, siKubernetes, siLinux,
  siLua, siMariadb, siMongodb, siMysql, siNextdotjs, siNginx, siNodedotjs, siOllama, siOpentelemetry, siPandas, siPhp,
  siPostgresql, siPrometheus, siPython, siPytorch, siRabbitmq, siReact, siRedis, siRuby, siRust, siSentry, siSnowflake,
  siSqlite, siSupabase, siSvelte, siSwift, siTailwindcss, siTauri, siTerraform, siTypescript, siVercel, siVite, siVuedotjs,
  siStripe, siNotion, siFigma, siShopify, siSpotify, siAirbnb, siDiscord, siYoutube, siX, siInstagram, siFacebook, siWhatsapp, siTelegram, siPaypal, siZoom, siDropbox, siTrello, siJira, siAsana, siHubspot, siHuggingface, siGoogle, siLinear, siNpm, siBun, siDeno, siWebpack, siJest, siVitest, siCypress, siPrisma, siBootstrap, siWordpress, siNetlify, siUbuntu, siAndroid, siFirefox, siSafari, siMistralai, siGooglegemini, siPerplexity, siClaude, siTensorflow, siNumpy, siJupyter, siOkta, siMailchimp, siPosthog, siNuxt, siAstro, siObsidian, siBitwarden, siSignal, siMattermost,
  siApple, type SimpleIcon
} from 'simple-icons'
import { DatabaseIcon } from './DatabaseIcon'

export type IconComponent = ComponentType<{ size?: number | string; fill?: string; theme?: 'outline'; strokeWidth?: number; className?: string }>

// The words a model writes in icon="...". Short, lower-case, close to what it would guess; the rest are aliases below.
// Explicit imports, not `import *`, so the bundle ships only these.
export const GENERIC_ICONS: Record<string, IconComponent> = {
  database: DatabaseIcon, 'database-sync': DatabaseSync, 'database-search': DatabaseSearch, 'database-network': DatabaseNetwork,
  server: Server, storage: HardDisk, disk: Disk, cloud: CloudStorage, memory: Memory, cpu: Cpu, chip: Chip,
  file: Page, files: DataFile, document: DocDetail, folder: FolderClose, 'folder-open': FolderOpen, folders: Folder, spreadsheet: Excel,
  table: Table, sheet: DataSheet, text: Word, notes: Notes, log: Log,
  chart: ChartHistogram, 'line-chart': ChartLine, 'pie-chart': ChartPie, 'scatter-chart': ChartScatter, graph: ChartGraph,
  dashboard: DashboardOne, analytics: Analysis,
  user: User, users: Peoples, team: Group, key: Key, lock: Lock, shield: Shield, security: Protect, fingerprint: Fingerprint,
  settings: Setting, config: Config, tools: Tool, search: Search, filter: Filter, transform: Transform,
  code: Code, terminal: Terminal, api: Api, bug: Bug, plugin: Puzzle, components: Components,
  web: Globe, globe: Earth, network: NetworkTree, connection: Connection, link: Link, wifi: Wifi, router: Router, plug: Plug,
  mail: Mail, message: MessageOne, chat: Message, inbox: Inbox, send: Send, bell: BellRing,
  calendar: Calendar, schedule: Schedule, clock: Time, timer: Timer, alarm: Alarm, hourglass: Hourglass,
  refresh: Refresh, sync: Cycle, upload: Upload, download: Download, export: Share, backup: Save, loading: Loading,
  monitor: Computer, desktop: Computer, phone: Phone, browser: Browser, layout: LayoutOne, app: ApplicationOne, application: Application, menu: ApplicationMenu,
  ai: Robot, agent: Robot, brain: Brain, model: MindMapping, workflow: BranchTwo, pipeline: BranchTwo,
  layers: Layers, box: Box, package: Box, cube: Cube, tree: Tree,
  rocket: Rocket, bolt: Lightning, fire: Fire, eye: Eyes, edit: Edit, delete: Delete, add: Plus, check: Check,
  home: Home, image: Pic, video: Video, music: Music, play: Play, wallet: Wallet, shop: Shop,
  book: BookOne, library: Bookshelf, map: MapTwo, compass: Compass, star: Star, heart: Heart, flag: Flag
}

// Other words for the same icon.
export const ICON_ALIASES: Record<string, string> = {
  db: 'database', sql: 'database', datastore: 'database', 'data-store': 'database', store: 'database',
  'hard-drive': 'storage', 'hard-disk': 'storage', volume: 'storage', 'object-storage': 'storage', bucket: 'storage',
  'cloud-storage': 'cloud', internet: 'web', www: 'web', http: 'api', rest: 'api', endpoint: 'api', 'api-gateway': 'api',
  gateway: 'router', cache: 'memory', ram: 'memory', processor: 'cpu', gpu: 'chip',
  doc: 'document', docs: 'document', pdf: 'document', csv: 'sheet', excel: 'spreadsheet', xlsx: 'spreadsheet',
  person: 'user', people: 'users', group: 'team', auth: 'key', authentication: 'key', secret: 'key', password: 'lock',
  secure: 'security', permissions: 'security', permission: 'security', gear: 'settings', setting: 'settings', configuration: 'config',
  wrench: 'tools', tool: 'tools', 'search-engine': 'search', query: 'search', cli: 'terminal', shell: 'terminal', console: 'terminal',
  email: 'mail', notification: 'bell', notifications: 'bell', alert: 'bell', alerts: 'bell', jobs: 'schedule', cron: 'schedule',
  queue: 'layers', stack: 'layers', report: 'document', scheduler: 'schedule', time: 'clock', etl: 'pipeline', flow: 'workflow', orchestration: 'workflow',
  robot: 'ai', llm: 'ai', agents: 'agent', ml: 'brain', embeddings: 'model', embedding: 'model', vector: 'model', index: 'search',
  indexing: 'search', ui: 'monitor', screen: 'monitor', gui: 'monitor', frontend: 'monitor', client: 'monitor', laptop: 'desktop',
  mobile: 'phone', monitoring: 'dashboard', metrics: 'chart', observability: 'dashboard', stats: 'chart', 'bar-chart': 'chart',
  service: 'box', microservice: 'box', container: 'box', module: 'cube', component: 'components', library: 'library',
  logs: 'log', logging: 'log', share: 'export', publish: 'export', save: 'backup', restore: 'backup',
  repo: 'folder', directory: 'folder', raw: 'files', import: 'download', ingest: 'download', ingestion: 'download',
  preprocess: 'transform', processing: 'transform', clean: 'filter', speed: 'bolt', performance: 'bolt', lightning: 'bolt'
}

// Technology logos, written si:name. The name is the one people use, not always Simple Icons' own slug.
export const BRAND_ICONS: Record<string, SimpleIcon> = {
  sqlite: siSqlite, duckdb: siDuckdb, postgresql: siPostgresql, postgres: siPostgresql, mysql: siMysql, mariadb: siMariadb,
  redis: siRedis, mongodb: siMongodb, clickhouse: siClickhouse, snowflake: siSnowflake, elasticsearch: siElasticsearch,
  kafka: siApachekafka, rabbitmq: siRabbitmq, airflow: siApacheairflow, spark: siApachespark, pandas: siPandas,
  go: siGo, python: siPython, typescript: siTypescript, javascript: siJavascript, rust: siRust, kotlin: siKotlin, swift: siSwift,
  ruby: siRuby, php: siPhp, lua: siLua, cpp: siCplusplus, dotnet: siDotnet,
  react: siReact, vue: siVuedotjs, svelte: siSvelte, angular: siAngular, nextjs: siNextdotjs, tailwind: siTailwindcss, vite: siVite,
  nodejs: siNodedotjs, express: siExpress, fastapi: siFastapi, flask: siFlask, django: siDjango, graphql: siGraphql,
  electron: siElectron, tauri: siTauri, pytorch: siPytorch, anthropic: siAnthropic, ollama: siOllama,
  docker: siDocker, kubernetes: siKubernetes, terraform: siTerraform, linux: siLinux, apple: siApple, nginx: siNginx,
  git: siGit, github: siGithub, gitlab: siGitlab, githubactions: siGithubactions, jenkins: siJenkins,
  prometheus: siPrometheus, grafana: siGrafana, opentelemetry: siOpentelemetry, datadog: siDatadog, sentry: siSentry,
  googlecloud: siGooglecloud, cloudflare: siCloudflare, vercel: siVercel, firebase: siFirebase, supabase: siSupabase,
  stripe: siStripe, notion: siNotion, figma: siFigma, shopify: siShopify, spotify: siSpotify, airbnb: siAirbnb, discord: siDiscord, youtube: siYoutube, x: siX, instagram: siInstagram, facebook: siFacebook, whatsapp: siWhatsapp, telegram: siTelegram, paypal: siPaypal, zoom: siZoom, dropbox: siDropbox, trello: siTrello, jira: siJira, asana: siAsana, hubspot: siHubspot, huggingface: siHuggingface, google: siGoogle, linear: siLinear, npm: siNpm, bun: siBun, deno: siDeno, webpack: siWebpack, jest: siJest, vitest: siVitest, cypress: siCypress, prisma: siPrisma, bootstrap: siBootstrap, wordpress: siWordpress, netlify: siNetlify, ubuntu: siUbuntu, android: siAndroid, firefox: siFirefox, safari: siSafari, mistral: siMistralai, gemini: siGooglegemini, perplexity: siPerplexity, claude: siClaude, tensorflow: siTensorflow, numpy: siNumpy, jupyter: siJupyter, okta: siOkta, mailchimp: siMailchimp, posthog: siPosthog, nuxt: siNuxt, astro: siAstro, obsidian: siObsidian, bitwarden: siBitwarden, signal: siSignal, mattermost: siMattermost
}

export const BRAND_PREFIX = 'si:'

export type ResolvedIcon =
  | { kind: 'generic'; component: IconComponent }
  | { kind: 'brand'; icon: SimpleIcon }
  /** A logo of the larger set, loaded when it is first asked for: the markup of the drawing and its size. */
  | { kind: 'logo'; body: string; width: number; height: number }

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

/** The icon a name stands for, or null when the app has none: nothing is drawn rather than a wrong picture. */
export function resolveIcon(name: string | undefined): ResolvedIcon | null {
  if (!name) return null
  const key = normalise(name)
  if (key.startsWith(BRAND_PREFIX)) {
    const icon = BRAND_ICONS[key.slice(BRAND_PREFIX.length).replace(/-/g, '')] ?? BRAND_ICONS[key.slice(BRAND_PREFIX.length)]
    return icon ? { kind: 'brand', icon } : null
  }
  const component = GENERIC_ICONS[key] ?? GENERIC_ICONS[ICON_ALIASES[key] ?? '']
  if (component) return { kind: 'generic', component }
  // A technology written as it is said (react, stripe) has its logo too.
  const brand = BRAND_ICONS[key.replace(/-/g, '')] ?? BRAND_ICONS[key]
  return brand ? { kind: 'brand', icon: brand } : null
}

export function genericIconNames(): string[] {
  return Object.keys(GENERIC_ICONS)
}

export function brandIconNames(): string[] {
  return Object.keys(BRAND_ICONS)
}

// The larger set of logos (SVG Logos, CC0: cloud services, productivity and AI products...) is not part of the first load: it is read from the
// app's own files the first time a name is not found in the lists above, and kept. Nothing is fetched from the network. The markup comes from
// that package and never from an answer: an answer only names a logo.
type LogoSet = { icons: Record<string, { body: string; width?: number; height?: number }>; width?: number; height?: number }

let logoSet: Promise<LogoSet> | null = null
const loadLogoSet = () => (logoSet ??= import('@iconify-json/logos/icons.json').then((module) => (module.default ?? module) as unknown as LogoSet))

const LOGO_ALIASES: Record<string, string> = {
  gcp: 'google-cloud', 'google-cloud-platform': 'google-cloud', k8s: 'kubernetes', postgres: 'postgresql', amazon: 'aws', 'amazon-web-services': 'aws',
  'microsoft-azure': 'azure', gmail: 'google-gmail', 'google-drive': 'google-drive', 'vs-code': 'visual-studio-code', vscode: 'visual-studio-code',
  gpt: 'openai-icon', chatgpt: 'openai-icon', ms: 'microsoft-icon', teams: 'microsoft-teams', 'ms-teams': 'microsoft-teams'
}

/**
 * A logo drawn only in very dark colours vanishes on a dark page: its colours are then the colour of the text around it, as they were for the
 * logos of the first list. A logo with any other colour keeps all of them.
 */
export function followText(body: string): string {
  const fills = [...body.matchAll(/fill="(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|black)"/g)].map((match) => match[1].toLowerCase())
  if (fills.length === 0) return body
  const dark = (fill: string) => {
    if (fill === 'black') return true
    const hex = fill.length === 4 ? fill.slice(1).split('').map((digit) => digit + digit).join('') : fill.slice(1)
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.15
  }
  return fills.every(dark) ? body.replace(/fill="(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|black)"/g, 'fill="currentColor"') : body
}

const logoCache = new Map<string, ResolvedIcon | null>()

/** The names a logo may be filed under: the name as said, with -icon (the mark alone), without dashes. */
export function logoCandidates(name: string): string[] {
  const key = normalise(name).replace(/^si:/, '')
  const base = LOGO_ALIASES[key] ?? key
  // The mark alone (-icon) comes first: an icon is a square, and a name written out in a logo would be drawn too small to read.
  return [...new Set([`${base}-icon`, base, `${base.replace(/-/g, '')}-icon`, base.replace(/-/g, '')])]
}

/** What is already known about a logo of the larger set, without waiting: the icon, null when the set has none, undefined when it is not read yet. */
export function peekLogo(name: string | undefined): ResolvedIcon | null | undefined {
  if (!name) return null
  return logoCache.get(normalise(name))
}

/** The logo of the larger set that a name stands for, or null. Read once, then answered from memory. */
export async function loadLogo(name: string | undefined): Promise<ResolvedIcon | null> {
  if (!name) return null
  const key = normalise(name)
  const cached = logoCache.get(key)
  if (cached !== undefined) return cached
  let found: ResolvedIcon | null = null
  try {
    const set = await loadLogoSet()
    for (const candidate of logoCandidates(name)) {
      const icon = Object.prototype.hasOwnProperty.call(set.icons, candidate) ? set.icons[candidate] : undefined
      if (icon) {
        found = { kind: 'logo', body: followText(icon.body), width: icon.width ?? set.width ?? 24, height: icon.height ?? set.height ?? 24 }
        break
      }
    }
  } catch {
    found = null
  }
  logoCache.set(key, found)
  return found
}
