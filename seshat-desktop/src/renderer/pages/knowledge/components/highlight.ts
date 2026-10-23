export type Fragment = { text: string; mark: boolean }

// Cuts a page of text around the cited passage so the viewer can mark it. Without a match the whole page is one unmarked fragment.
export function splitHighlight(text: string, excerpt: string): Fragment[] {
  const needle = excerpt.trim()
  const start = needle ? text.indexOf(needle) : -1
  if (start < 0) return [{ text, mark: false }]
  const fragments: Fragment[] = []
  if (start > 0) fragments.push({ text: text.slice(0, start), mark: false })
  fragments.push({ text: needle, mark: true })
  const end = start + needle.length
  if (end < text.length) fragments.push({ text: text.slice(end), mark: false })
  return fragments
}
