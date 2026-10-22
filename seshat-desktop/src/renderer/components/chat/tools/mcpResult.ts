const PRETTY_LIMIT = 200_000

export type McpResultText = { text: string; language?: 'json' }

function isTextBlock(value: unknown): value is { type: 'text'; text: string } {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'text' && typeof (value as { text?: unknown }).text === 'string'
}

function tryParse(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/**
 * An MCP tool answers with text, which a vendor usually fills with compact JSON. Shown as it came it is one long line; this indents
 * it, and unwraps the standard content blocks ([{ "type": "text", "text": ... }]) some servers send as the text itself.
 */
export function formatMcpResult(content: string): McpResultText {
  if (content.length > PRETTY_LIMIT) return { text: content }
  const parsed = tryParse(content)
  if (parsed === undefined) return { text: content }

  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isTextBlock)) {
    const inner = parsed.map((block) => block.text)
    const single = inner.length === 1 ? tryParse(inner[0]) : undefined
    if (single !== undefined) return { text: JSON.stringify(single, null, 2), language: 'json' }
    return { text: inner.join('\n\n') }
  }
  return { text: JSON.stringify(parsed, null, 2), language: 'json' }
}
