// A skill file is YAML front matter between --- lines followed by markdown.
// Manus's skill viewer shows the front matter as its own block above the
// rendered body, so split it out rather than letting the markdown renderer
// treat it as a horizontal rule + stray paragraph.
export function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { frontmatter: '', body: raw }
  return { frontmatter: match[1], body: raw.slice(match[0].length) }
}
