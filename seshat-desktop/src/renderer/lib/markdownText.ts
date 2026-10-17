// Text fixes applied to a message before it is rendered as Markdown.

// Close any unclosed code fences so the markdown parser never treats the
// rest of the document as a code block mid-stream.
export function sealOpenFences(text: string): string {
  const lines = text.split('\n')
  let inFence = false
  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence
    }
  }
  return inFence ? `${text}\n\`\`\`` : text
}

export function normalizeMathDelimiters(text: string): string {
  const segments = text.split(/(^[ \t]*(?:`{3,}|~{3,})[\s\S]*?^[ \t]*(?:`{3,}|~{3,})[ \t]*$)/gm)
  return segments.map((segment) => {
    if (/^[ \t]*(?:`{3,}|~{3,})/.test(segment)) return segment
    return segment
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$\n${math.trim()}\n$$`)
      .replace(/\\\(([^()\n]+?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
  }).join('')
}
