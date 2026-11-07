// What changed in each release, told with a picture and a few words: the card that opens after an update reads this.

export type VisualId =
  | 'look' | 'tasks' | 'bell' | 'home' | 'settings' | 'projects'
  | 'genui' | 'pages' | 'language' | 'skills' | 'changes' | 'usage'

/** A card of the release: its picture, and its title and text, which are read from the translations under whatsnew.highlights.<id>. */
export type Highlight = { id: VisualId }

/**
 * What a release brings. from, when there is one, makes the card say "New in 0.3.0 -> 0.3.17": the release then tells everything since
 * that version, for a person who comes from far behind. The texts are in the translations (whatsnew.release.headline).
 */
export type ReleaseNotes = { version: string; from?: string; highlights: Highlight[] }

/** Newest first. A release with no entry here opens no card. */
export const RELEASES: ReleaseNotes[] = [
  {
    version: '0.3.17',
    from: '0.3.0',
    highlights: [
      { id: 'genui' },
      { id: 'pages' },
      { id: 'skills' },
      { id: 'changes' },
      { id: 'look' },
      { id: 'language' },
      { id: 'tasks' },
      { id: 'bell' },
      { id: 'usage' },
      { id: 'home' },
      { id: 'settings' },
      { id: 'projects' }
    ]
  }
]

/** The label of a release: its version, or the range it covers. */
export function releaseLabel(release: ReleaseNotes): string {
  return release.from ? `${release.from} → ${release.version}` : release.version
}

/** Compares two versions written as 1.2.3: negative when a is older, positive when it is newer. Anything after a dash is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.split('-')[0].split('.').map((part) => Number.parseInt(part, 10) || 0)
  const left = parts(a)
  const right = parts(b)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/** The release to present: the newest one the person has not seen that this version includes; none on a first install or when nothing is new. */
export function releaseToShow(current: string, lastSeen: string | null, releases: ReleaseNotes[] = RELEASES): ReleaseNotes | null {
  if (!lastSeen) return null
  return releases.find((release) => compareVersions(release.version, lastSeen) > 0 && compareVersions(release.version, current) <= 0) ?? null
}

export const SEEN_KEY = 'seshat.whatsnew.seen'

export function getSeenVersion(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function setSeenVersion(version: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, version)
  } catch {
    // Storage is blocked: the card may open again next time.
  }
}

/** Opens the card on demand (the menu of the sidebar). */
export const OPEN_WHATS_NEW_EVENT = 'seshat-whats-new-open'
