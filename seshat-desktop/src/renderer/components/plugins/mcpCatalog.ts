import type { MCPServer } from '@renderer/components/config/mcp/mcpTypes'

/** Where what the person types goes: an environment variable, a header of the request, or an argument of the command. */
export type McpInputTarget = { env: string } | { header: string; prefix?: string } | { arg: string }

export type McpInput = {
  id: string
  label: string
  placeholder: string
  required: boolean
  secret?: boolean
  target: McpInputTarget
}

/** An MCP server offered to be installed. Each was read and run before it was listed (see the comment above the list). */
export type McpCatalogEntry = {
  /** The name the server takes once installed. */
  name: string
  title: string
  description: string
  category: string
  /** The mark of the vendor: a key of the brand marks, or the name of a logo file (see catalog/mcpLogos.ts). */
  brand: string
  tags: string[]
  /** What must be on the machine for it to start ("Node.js"). */
  needs: string[]
  docs: string
  server_type: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  inputs: McpInput[]
}

/**
 * The MCP servers offered with SeshatOS. They were chosen for what the agent does not already do on its own (it reads the web, runs
 * commands and keeps files without any of them), checked on 2026-10-31: the package is published and recent, the licence is open, and the
 * remote ones answer. A server installed here runs on this machine with the person's permissions, after they have seen what it runs.
 */
export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    name: 'context7',
    title: 'Context7',
    description: 'Up-to-date documentation and code examples for the libraries and frameworks you use, fetched when the agent needs them.',
    category: 'Development',
    brand: 'context7',
    tags: ['documentation', 'libraries', 'code'],
    needs: ['Node.js'],
    docs: 'https://github.com/upstash/context7',
    server_type: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    inputs: [{ id: 'key', label: 'API key (optional, raises the limits)', placeholder: 'ctx7sk-...', required: false, secret: true, target: { env: 'CONTEXT7_API_KEY' } }]
  },
  {
    name: 'playwright',
    title: 'Playwright',
    description: 'Drives a real browser: open pages, click, fill forms, take screenshots and test a web app, from the page structure rather than pictures.',
    category: 'Browser',
    brand: 'playwright',
    tags: ['browser', 'testing', 'automation'],
    needs: ['Node.js'],
    docs: 'https://github.com/microsoft/playwright-mcp',
    server_type: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    inputs: []
  },
  {
    name: 'chrome-devtools',
    title: 'Chrome DevTools',
    description: "Lets the agent debug and measure a web page in Chrome: network, console, performance traces and what the page really does.",
    category: 'Browser',
    brand: 'googlechrome',
    tags: ['debugging', 'performance', 'web'],
    needs: ['Node.js', 'Chrome'],
    docs: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    server_type: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest'],
    inputs: []
  },
  {
    name: 'sequential-thinking',
    title: 'Sequential Thinking',
    description: 'A tool to think a hard problem through in steps, revise earlier steps and try another path before answering.',
    category: 'Reasoning',
    brand: 'mcp',
    tags: ['reasoning', 'planning'],
    needs: ['Node.js'],
    docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    server_type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    inputs: []
  },
  {
    name: 'dbhub',
    title: 'DBHub',
    description: 'Reads the schema and runs queries on your database: PostgreSQL, MySQL, MariaDB, SQL Server or SQLite, through one connection string.',
    category: 'Data',
    brand: 'dbhub',
    tags: ['database', 'sql', 'query'],
    needs: ['Node.js'],
    docs: 'https://github.com/bytebase/dbhub',
    server_type: 'stdio',
    command: 'npx',
    args: ['-y', '@bytebase/dbhub@latest', '--transport', 'stdio'],
    inputs: [{ id: 'dsn', label: 'Connection string', placeholder: 'postgres://user:password@localhost:5432/dbname', required: true, secret: true, target: { arg: '--dsn' } }]
  },
  {
    name: 'figma',
    title: 'Figma',
    description: 'Gives the agent the layout and styles of a Figma file or frame, so that it can build the interface from the design.',
    category: 'Design',
    brand: 'figma',
    tags: ['design', 'figma', 'interface'],
    needs: ['Node.js'],
    docs: 'https://github.com/GLips/Figma-Context-MCP',
    server_type: 'stdio',
    command: 'npx',
    args: ['-y', 'figma-developer-mcp', '--stdio'],
    inputs: [{ id: 'key', label: 'Figma access token', placeholder: 'figd_...', required: true, secret: true, target: { env: 'FIGMA_API_KEY' } }]
  },
  {
    name: 'firecrawl',
    title: 'Firecrawl',
    description: 'Scrapes and crawls websites into clean text, including pages that need JavaScript, and extracts structured data from them.',
    category: 'Web',
    brand: 'firecrawl',
    tags: ['scraping', 'crawl', 'web'],
    needs: ['Node.js'],
    docs: 'https://github.com/firecrawl/firecrawl-mcp-server',
    server_type: 'stdio',
    command: 'npx',
    args: ['-y', 'firecrawl-mcp'],
    inputs: [{ id: 'key', label: 'Firecrawl API key', placeholder: 'fc-...', required: true, secret: true, target: { env: 'FIRECRAWL_API_KEY' } }]
  },
  {
    name: 'huggingface',
    title: 'Hugging Face',
    description: 'Searches models, datasets, Spaces and papers on the Hugging Face Hub, and reads their documentation.',
    category: 'AI',
    brand: 'huggingface',
    tags: ['models', 'datasets', 'papers'],
    needs: [],
    docs: 'https://huggingface.co/docs/hub/mcp',
    server_type: 'http',
    url: 'https://huggingface.co/mcp',
    inputs: [{ id: 'token', label: 'Access token (optional, for your private repositories)', placeholder: 'hf_...', required: false, secret: true, target: { header: 'Authorization', prefix: 'Bearer ' } }]
  }
]

/** The catalog entries the person has not installed yet: a server of the same name is an installed one. */
export function availableMcp(installed: Array<{ name: string }>): McpCatalogEntry[] {
  const names = new Set(installed.map((server) => server.name.toLowerCase()))
  return MCP_CATALOG.filter((entry) => !names.has(entry.name.toLowerCase()))
}

/** What the person will have running, as one line: shown before the server is installed. */
export function commandLine(entry: McpCatalogEntry, values: Record<string, string> = {}): string {
  if (entry.server_type === 'http') return entry.url ?? ''
  const args = [...(entry.args ?? [])]
  for (const input of entry.inputs) {
    if ('arg' in input.target) args.push(input.target.arg, values[input.id]?.trim() ? '<your value>' : `<${input.label.toLowerCase()}>`)
  }
  return [entry.command, ...args].join(' ')
}

/** The inputs that are required and still empty. */
export function missingInputs(entry: McpCatalogEntry, values: Record<string, string>): McpInput[] {
  return entry.inputs.filter((input) => input.required && !values[input.id]?.trim())
}

/** The server to create from an entry and what the person typed. An empty optional input is left out. */
export function buildServer(entry: McpCatalogEntry, values: Record<string, string>): Partial<MCPServer> {
  const env: Record<string, string> = {}
  const headers: Record<string, string> = {}
  const args = [...(entry.args ?? [])]
  for (const input of entry.inputs) {
    const value = values[input.id]?.trim()
    if (!value) continue
    if ('env' in input.target) env[input.target.env] = value
    else if ('header' in input.target) headers[input.target.header] = `${input.target.prefix ?? ''}${value}`
    else args.push(input.target.arg, value)
  }
  const stdio = entry.server_type === 'stdio'
  return {
    name: entry.name,
    display_name: entry.title,
    server_type: entry.server_type,
    command: stdio ? entry.command : '',
    args: stdio ? args : [],
    env: stdio ? env : {},
    url: stdio ? '' : entry.url,
    headers: stdio ? {} : headers,
    timeout_secs: 60,
    icon: '',
    enabled: true
  }
}
