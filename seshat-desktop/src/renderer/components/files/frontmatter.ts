// A markdown file may start with YAML front matter between --- lines (a skill's SKILL.md always does). Split it out and show it as its own
// block above the rendered body, rather than letting the markdown renderer take it for a horizontal rule and a stray paragraph.
export function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { frontmatter: '', body: raw }
  return { frontmatter: match[1], body: raw.slice(match[0].length) }
}
