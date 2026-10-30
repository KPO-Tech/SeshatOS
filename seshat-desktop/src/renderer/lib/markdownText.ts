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

// Inline code stays out of the pairing below: a `$$` written in code is not a delimiter.
const INLINE_CODE = /`[^`\n]*`/g
const MASK = '\u0000'

/**
 * The display formulas of a message, in the form the parser can close.
 *
 * A model writes `$$\begin{array}...\end{array}$$` with the closing `$$` at the end of a line of content. The parser only closes a
 * displayed formula on a line that holds `$$` alone, so such a formula stayed open to the end of the message, swallowed every section
 * after it, and the whole rest was drawn as one failed formula. Each pair of `$$` that spans lines is put in the form the parser reads:
 * `$$`, the content, `$$`, each on its own line. A pair on one line stays as it is, a pair that crosses a blank line is not a formula (a
 * stray `$$` upstream shifted the pairing) and a `$$` left without a partner is written as text: neither may open a block that runs on.
 */
export function closeDisplayMath(text: string): string {
  if (!text.includes('$$')) return text
  const kept: string[] = []
  const masked = text.replace(INLINE_CODE, (code) => {
    kept.push(code)
    return `${MASK}${kept.length - 1}${MASK}`
  })
  const parts = masked.split(/(?<!\\)\$\$/)
  let out = parts[0]
  for (let index = 1; index < parts.length; index += 2) {
    const content = parts[index]
    const rest = parts[index + 1]
    if (rest === undefined) {
      out += `\\$\\$${content}`
      break
    }
    if (/\n[ \t]*\n/.test(content) || content.length > 6000) {
      out += `\\$\\$${content}\\$\\$${rest}`
    } else if (content.includes('\n') && !(/^[ \t]*\n/.test(content) && /\n[ \t]*$/.test(content))) {
      out += `\n\n$$\n${content.trim()}\n$$\n\n${rest}`
    } else {
      out += `$$${content}$$${rest}`
    }
  }
  return out.replace(new RegExp(`${MASK}(\\d+)${MASK}`, 'g'), (_match, number: string) => kept[Number(number)])
}

export function normalizeMathDelimiters(text: string): string {
  const segments = text.split(/(^[ \t]*(?:`{3,}|~{3,})[\s\S]*?^[ \t]*(?:`{3,}|~{3,})[ \t]*$)/gm)
  return segments.map((segment) => {
    if (/^[ \t]*(?:`{3,}|~{3,})/.test(segment)) return segment
    return closeDisplayMath(
      segment
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$\n${math.trim()}\n$$`)
        .replace(/\\\(([^()\n]+?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
    )
  }).join('')
}
