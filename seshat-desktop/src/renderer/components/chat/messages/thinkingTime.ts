/** How long a thought took, as shown at the right of its row: 12s, 1m 05s, 1h 02m. */
export function formatThinkingDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/**
 * The thought itself names its duration. A message is replaced by the server's copy when the answer ends, so an id made
 * of the message would be lost; the text is the same before and after.
 */
export function thinkingKey(sessionId: string | undefined, text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  return `${sessionId ?? ''}:${(hash >>> 0).toString(36)}:${text.length}`
}

/** Keeps the newest durations: the oldest keys, which come first, are dropped. */
export function keepNewestDurations(durations: Record<string, number>, max: number): Record<string, number> {
  const keys = Object.keys(durations)
  if (keys.length <= max) return durations
  const kept: Record<string, number> = {}
  for (const key of keys.slice(keys.length - max)) kept[key] = durations[key]
  return kept
}
