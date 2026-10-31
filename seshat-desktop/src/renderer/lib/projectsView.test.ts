import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from './projects'
import { arrangeProjects, countTabs, fileCountLabel, inTab, parseTags, relativeTime } from './projectsView'

const NOW = Date.parse('2026-10-31T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const HOUR = 3_600_000
const DAY = 24 * HOUR

const project = (name: string, patch: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: `path-${name}`,
  name,
  rootPath: `D:\\work\\${name}`,
  sessionCount: 0,
  lastActiveAt: null,
  description: '',
  tags: [],
  color: 'orange',
  pinned: false,
  archived: false,
  activeSessionCount: 0,
  lastSessionId: null,
  ...patch
})

const all = [
  project('Immobilier', { lastActiveAt: ago(2 * HOUR), sessionCount: 4, description: 'Analyses de marché', tags: ['data', 'analyse'], pinned: true }),
  project('Seshat', { lastActiveAt: ago(1 * DAY), sessionCount: 9, activeSessionCount: 1, tags: ['python', 'rag'] }),
  project('Research', { lastActiveAt: ago(3 * DAY), sessionCount: 2 }),
  project('Finance', { lastActiveAt: ago(10 * DAY), sessionCount: 5, tags: ['excel'] }),
  project('Archive', { lastActiveAt: ago(60 * DAY), archived: true })
]
const names = (list: ProjectSummary[]) => list.map((p) => p.name)

describe('tabs', () => {
  it('keeps archived projects in their own tab only', () => {
    expect(inTab(all[4], 'all', NOW)).toBe(false)
    expect(inTab(all[4], 'archived', NOW)).toBe(true)
    expect(inTab(all[0], 'archived', NOW)).toBe(false)
  })

  it('counts what each tab holds', () => {
    expect(countTabs(all, NOW)).toEqual({ all: 4, recent: 3, pinned: 1, active: 1, archived: 1 })
  })

  it('calls recent what was active in the last week', () => {
    expect(inTab(all[2], 'recent', NOW)).toBe(true)
    expect(inTab(all[3], 'recent', NOW)).toBe(false)
    expect(inTab(project('never'), 'recent', NOW)).toBe(false)
  })
})

describe('arrangeProjects', () => {
  const view = { tab: 'all' as const, query: '', sort: 'recent' as const }

  it('puts pinned projects first, then the most recently active', () => {
    expect(names(arrangeProjects(all, view, NOW))).toEqual(['Immobilier', 'Seshat', 'Research', 'Finance'])
    const pinnedLater = all.map((p) => (p.name === 'Finance' ? { ...p, pinned: true } : p))
    expect(names(arrangeProjects(pinnedLater, view, NOW))).toEqual(['Immobilier', 'Finance', 'Seshat', 'Research'])
  })

  it('sorts by name in both directions and by number of conversations', () => {
    const unpinned = all.map((p) => ({ ...p, pinned: false }))
    expect(names(arrangeProjects(unpinned, { ...view, sort: 'name-asc' }, NOW))).toEqual(['Finance', 'Immobilier', 'Research', 'Seshat'])
    expect(names(arrangeProjects(unpinned, { ...view, sort: 'name-desc' }, NOW))).toEqual(['Seshat', 'Research', 'Immobilier', 'Finance'])
    expect(names(arrangeProjects(unpinned, { ...view, sort: 'sessions' }, NOW))).toEqual(['Seshat', 'Finance', 'Immobilier', 'Research'])
  })

  it('searches the name, the folder, the description and the tags, every word of it', () => {
    expect(names(arrangeProjects(all, { ...view, query: 'marché' }, NOW))).toEqual(['Immobilier'])
    expect(names(arrangeProjects(all, { ...view, query: 'RAG' }, NOW))).toEqual(['Seshat'])
    expect(names(arrangeProjects(all, { ...view, query: 'work finance' }, NOW))).toEqual(['Finance'])
    expect(names(arrangeProjects(all, { ...view, query: 'data excel' }, NOW))).toEqual([])
  })

  it('applies the tab and the search together, and leaves the list as it was', () => {
    const before = names(all)
    expect(names(arrangeProjects(all, { tab: 'recent', query: 'res', sort: 'recent' }, NOW))).toEqual(['Research'])
    expect(names(arrangeProjects(all, { tab: 'archived', query: '', sort: 'recent' }, NOW))).toEqual(['Archive'])
    expect(names(all)).toEqual(before)
  })
})

describe('relativeTime', () => {
  it('says how long ago, in the unit that fits', () => {
    expect(relativeTime(ago(20_000), NOW)).toBe('just now')
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe('5 minutes ago')
    expect(relativeTime(ago(1 * HOUR), NOW)).toBe('1 hour ago')
    expect(relativeTime(ago(2 * HOUR), NOW)).toBe('2 hours ago')
    expect(relativeTime(ago(1 * DAY), NOW)).toBe('1 day ago')
    expect(relativeTime(ago(3 * DAY), NOW)).toBe('3 days ago')
    expect(relativeTime(ago(8 * DAY), NOW)).toBe('1 week ago')
    expect(relativeTime(ago(60 * DAY), NOW)).toBe('2 months ago')
    expect(relativeTime(ago(400 * DAY), NOW)).toBe('1 year ago')
  })

  it('says nothing for no activity or a date it cannot read', () => {
    expect(relativeTime(null, NOW)).toBe('')
    expect(relativeTime('not a date', NOW)).toBe('')
  })
})

describe('fileCountLabel and parseTags', () => {
  it('counts files, with a plus when the count stopped at its limit, and a dash while it is not known', () => {
    expect(fileCountLabel(undefined, false)).toBe('- files')
    expect(fileCountLabel(1, false)).toBe('1 file')
    expect(fileCountLabel(24, false)).toBe('24 files')
    expect(fileCountLabel(5000, true)).toBe('5000+ files')
  })

  it('reads tags as typed', () => {
    expect(parseTags('data, analyse;  immobilier\nData ,, ')).toEqual(['data', 'analyse', 'immobilier', 'Data'])
    expect(parseTags('')).toEqual([])
  })
})
