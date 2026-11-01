// What changed in each release, told with a picture and a few words: the card that opens after an update reads this.

export type VisualId = 'look' | 'tasks' | 'bell' | 'home' | 'settings' | 'projects'

export type Highlight = { id: VisualId; title: string; text: string }

export type ReleaseNotes = { version: string; headline: string; highlights: Highlight[] }

/** Newest first. A release with no entry here opens no card. */
export const RELEASES: ReleaseNotes[] = [
  {
    version: '0.3.0',
    headline: 'A new look, and work that goes on in the background',
    highlights: [
      { id: 'look', title: 'Pick your look on the first launch', text: 'Dark, Light or Midnight, and an accent colour. The page restyles itself as you choose, and the same choices stay in Settings.' },
      { id: 'tasks', title: 'Downloads and installs go on in the background', text: 'Leave the page, even close the window: a card above the Store follows each task, with a number to click when there are several.' },
      { id: 'bell', title: 'A bell that keeps you informed', text: 'What finished, what failed and what the agent just did, kept in one place. You choose what to be told about, and when.' },
      { id: 'home', title: 'A fuller start page', text: 'Five ways to begin, the input docked at the bottom like in a conversation, and a switch for Generative UI one click away.' },
      { id: 'settings', title: 'One Settings, one look', text: 'Every page shares the same header, cards and controls, so what you look for is where you expect it.' },
      { id: 'projects', title: 'Projects you can read and ask about', text: 'Browse the files of a folder, read them, and start a conversation from the project with its context.' }
    ]
  }
]

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
