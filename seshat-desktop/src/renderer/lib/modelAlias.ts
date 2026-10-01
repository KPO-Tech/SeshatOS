// Some catalogs (OpenRouter in particular) prefix a model's name with its
// vendor - "anthropic/claude-3.7-sonnet" or "Anthropic: Claude 3.7 Sonnet".
// The provider column already shown next to the model name says where it
// comes from, so this strips that vendor prefix and keeps just the model
// itself. Leaves names with no recognizable prefix untouched.
export function modelAlias(label: string): string {
  const trimmed = label.trim()
  const slash = trimmed.match(/^[\w.-]{2,24}\/(.+)$/)
  if (slash?.[1]) return slash[1]
  const colon = trimmed.match(/^[\w.-]{2,24}:\s*(.+)$/)
  if (colon?.[1]) return colon[1]
  return trimmed
}
