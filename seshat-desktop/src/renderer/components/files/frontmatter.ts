// A markdown file may start with YAML front matter between --- lines (a skill's SKILL.md always does). Split it out and show it as its own
// block above the rendered body, rather than letting the markdown renderer take it for a horizontal rule and a stray paragraph.
export function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { frontmatter: '', body: raw }
  return { frontmatter: match[1], body: raw.slice(match[0].length) }
}

/** The top-level `key: value` lines of a front matter, quotes taken off. Nested blocks, lists and folded texts are left out. */
export function frontmatterFields(frontmatter: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if (!value || /^[>|][+-]?$/.test(value)) continue
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    fields[match[1]] = value
  }
  return fields
}
