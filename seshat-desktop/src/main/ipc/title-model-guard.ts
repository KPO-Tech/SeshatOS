const REASONING_MODEL_PATTERN = /think|reason|magistral|gpt-oss|deepseek-r|(^|[^a-z0-9])(r1|qwq|o1|o3|o4)([^a-z0-9]|$)/

// Mirrors settings.ValidateTitleModel in seshat-backend, which stays the
// authority; this only avoids downloading a model the backend would refuse.
export function titleModelRejection(name: string): string | null {
  const lower = name.trim().toLowerCase()
  if (!lower) return 'A model is required.'
  if (REASONING_MODEL_PATTERN.test(lower) || (lower.includes('qwen3') && !lower.includes('instruct-2507'))) {
    return 'This looks like a reasoning model. Title generation needs a fast non-thinking or specialised model.'
  }
  return null
}
