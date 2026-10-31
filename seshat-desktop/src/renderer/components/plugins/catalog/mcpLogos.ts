// The logo files of the MCP servers whose vendors simple-icons has no mark for. They are the logos the projects publish in their own
// repositories, kept small (Firecrawl's was cut down from 100 KB to a few).
const URLS = import.meta.glob('../../../assets/mcp-logos/*.{svg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

/** The address of the logo file called `name` (without its extension), or undefined when there is none. */
export function mcpLogo(name: string): string | undefined {
  return URLS[`../../../assets/mcp-logos/${name}.svg`] ?? URLS[`../../../assets/mcp-logos/${name}.png`]
}
