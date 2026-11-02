// The media a conversation shows (a picture, a clip, a GIF the agent made), kept once loaded. The chat list is virtualized: a message that
// leaves the screen is unmounted, and loading its file again when it comes back (8.9 MB of base64 for one GIF) showed a short "Loading"
// line first, then the media at its full height, so the list jumped under the reader. Kept here as a blob URL, with the size the media had
// once drawn, a message comes back at once and at its final height.

export type CachedSource = { url: string; width?: number; height?: number }

// Enough for the media of the conversations open lately; the oldest is released first.
const MAX_ENTRIES = 16

const entries = new Map<string, CachedSource>()
const pending = new Map<string, Promise<CachedSource>>()

export function sourceKey(sessionId: string, path: string): string {
  return `${sessionId}\n${path}`
}

/** The loaded media for key, marked as the most recently used, or undefined. */
export function cachedSource(key: string): CachedSource | undefined {
  const entry = entries.get(key)
  if (entry) {
    entries.delete(key)
    entries.set(key, entry)
  }
  return entry
}

/** Loads the media once (loadDataURL returns it as a data: URL) and keeps it as a blob URL; concurrent calls share one load. */
export function loadSource(key: string, loadDataURL: () => Promise<string>): Promise<CachedSource> {
  const ready = cachedSource(key)
  if (ready) return Promise.resolve(ready)
  let running = pending.get(key)
  if (!running) {
    running = loadDataURL()
      .then((dataURL) => {
        const entry: CachedSource = { url: URL.createObjectURL(dataURLToBlob(dataURL)) }
        entries.set(key, entry)
        while (entries.size > MAX_ENTRIES) {
          const oldest = entries.keys().next().value as string
          URL.revokeObjectURL(entries.get(oldest)!.url)
          entries.delete(oldest)
        }
        return entry
      })
      .finally(() => pending.delete(key))
    pending.set(key, running)
  }
  return running
}

/** Remembers the drawn size of the media, so that it takes its place before it is decoded again. */
export function rememberSize(key: string, width: number, height: number): void {
  const entry = entries.get(key)
  if (entry && width > 0 && height > 0) {
    entry.width = width
    entry.height = height
  }
}

export function dataURLToBlob(dataURL: string): Blob {
  const comma = dataURL.indexOf(',')
  const meta = dataURL.slice(5, comma)
  const type = meta.split(';')[0] || 'application/octet-stream'
  const body = dataURL.slice(comma + 1)
  if (!meta.endsWith(';base64')) return new Blob([decodeURIComponent(body)], { type })
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** For tests: forgets everything. */
export function clearSourceCache(): void {
  for (const entry of entries.values()) URL.revokeObjectURL(entry.url)
  entries.clear()
  pending.clear()
}
