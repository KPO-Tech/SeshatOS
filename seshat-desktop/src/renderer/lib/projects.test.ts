import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatSession } from '@renderer/stores/session'
import {
  addProject,
  listProjects,
  normalizeProjectPath,
  projectIdForPath,
  removeProject,
  renameProject,
  resolveProjectContextPath,
  selectRecentSessions,
} from './projects'

// This suite runs under vitest's plain 'node' environment (see
// vitest.config.ts) - no DOM, so no real localStorage. lib/projects.ts only
// needs the Storage subset below, and the app itself always runs in the
// Electron renderer where the real thing exists - a tiny in-memory stand-in
// here is simpler than pulling in jsdom for this one file.
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null }
  setItem(key: string, value: string) { this.store.set(key, value) }
  clear() { this.store.clear() }
}
;(globalThis as unknown as { localStorage?: MemoryStorage }).localStorage = new MemoryStorage()

function session(overrides: Partial<ChatSession>): ChatSession {
  return { id: 'a', title: 'A', messages: [], createdAt: '2026-01-01T00:00:00Z', ...overrides }
}

beforeEach(() => {
  localStorage.clear()
})

describe('normalizeProjectPath', () => {
  it('trims and drops trailing separators', () => {
    expect(normalizeProjectPath('  C:\\work\\app\\ ')).toBe('C:\\work\\app')
    expect(normalizeProjectPath('/home/me/app//')).toBe('/home/me/app')
  })
})

describe('selectRecentSessions', () => {
  const sessions = [
    session({ id: 'old', updatedAt: '2026-01-02T00:00:00Z' }),
    session({ id: 'new', updatedAt: '2026-03-01T00:00:00Z' }),
    session({ id: 'kb', source: 'knowledge' }),
    session({ id: 'inbox', source: 'inbox' }),
    session({ id: 'proj', projectPath: 'C:\\work\\app', updatedAt: '2026-02-01T00:00:00Z' })
  ]

  it('outside a project keeps only non-project chats, newest first, without knowledge or inbox', () => {
    expect(selectRecentSessions(sessions, null).map((s) => s.id)).toEqual(['new', 'old'])
  })

  it('inside a project keeps only that project, ignoring case and trailing slash', () => {
    expect(selectRecentSessions(sessions, 'c:\\WORK\\app\\').map((s) => s.id)).toEqual(['proj'])
  })

  it('caps the list', () => {
    expect(selectRecentSessions(sessions, null, 1)).toHaveLength(1)
  })
})

describe('resolveProjectContextPath', () => {
  it('prefers the ?project= parameter', () => {
    expect(resolveProjectContextPath({ projectParam: '/p', conversationRouteId: 'x' }, [])).toBe('/p')
  })

  it('uses the project of the open conversation', () => {
    const sessions = [session({ id: 'c1', projectPath: '/repo' })]
    expect(resolveProjectContextPath({ projectParam: null, conversationRouteId: 'c1' }, sessions)).toBe('/repo')
  })

  it('returns null with no project signal', () => {
    expect(resolveProjectContextPath({ projectParam: null }, [])).toBeNull()
  })

  it('resolves a project route id from a session that was never explicitly added', () => {
    const sessions = [session({ id: 'c1', projectPath: 'C:\\work\\app' })]
    const id = projectIdForPath('C:\\work\\app')
    expect(resolveProjectContextPath({ projectParam: null, projectRouteId: id }, sessions)).toBe('C:\\work\\app')
  })
})

describe('listProjects', () => {
  it('merges explicitly added projects with ones only implied by a session projectPath', () => {
    addProject('C:\\work\\app', 'My App')
    const sessions = [
      session({ id: 's1', projectPath: 'C:\\work\\app', updatedAt: '2026-02-01T00:00:00Z' }),
      session({ id: 's2', projectPath: 'C:\\work\\app', updatedAt: '2026-03-01T00:00:00Z' }),
      session({ id: 's3', projectPath: 'C:\\other\\thing', updatedAt: '2026-01-01T00:00:00Z' }),
    ]
    const projects = listProjects(sessions)
    expect(projects).toHaveLength(2)
    const app = projects.find((p) => p.rootPath === 'C:\\work\\app')
    expect(app?.name).toBe('My App')
    expect(app?.sessionCount).toBe(2)
    expect(app?.lastActiveAt).toBe('2026-03-01T00:00:00Z')
    const other = projects.find((p) => p.rootPath === 'C:\\other\\thing')
    expect(other?.name).toBe('thing')
    expect(other?.sessionCount).toBe(1)
  })

  it('an added project with no sessions yet still shows up, with 0 sessions', () => {
    addProject('C:\\empty\\project')
    expect(listProjects([])).toEqual([
      { id: projectIdForPath('C:\\empty\\project'), name: 'project', rootPath: 'C:\\empty\\project', sessionCount: 0, lastActiveAt: null },
    ])
  })
})

describe('addProject / renameProject / removeProject', () => {
  it('adding the same path twice updates instead of duplicating', () => {
    addProject('C:\\work\\app', 'First')
    addProject('C:\\work\\app', 'Second')
    expect(listProjects([]).map((p) => p.name)).toEqual(['Second'])
  })

  it('renaming an implicit (never-added) project promotes it to a stored one', () => {
    const sessions = [session({ id: 's1', projectPath: 'C:\\work\\app' })]
    const id = projectIdForPath('C:\\work\\app')
    renameProject(id, 'Renamed', 'C:\\work\\app')
    expect(listProjects(sessions).find((p) => p.id === id)?.name).toBe('Renamed')
  })

  it('removing a project drops the stored name but the project reappears (unnamed) while its sessions exist', () => {
    addProject('C:\\work\\app', 'My App')
    removeProject(projectIdForPath('C:\\work\\app'))
    const sessions = [session({ id: 's1', projectPath: 'C:\\work\\app' })]
    expect(listProjects(sessions).find((p) => p.rootPath === 'C:\\work\\app')?.name).toBe('app')
  })

  it('self-heals a stale stored id from before a projectIdForPath change, instead of listing the folder twice and refusing to delete', () => {
    // Simulates a record written by an older id scheme - readStoredProjects
    // must re-derive the id from rootPath, not trust what's on disk.
    localStorage.setItem('seshat.projects.v1', JSON.stringify([
      { id: 'path-stale-id', rootPath: 'C:\\work\\app', name: 'My App' },
    ]))
    const sessions = [session({ id: 's1', projectPath: 'C:\\work\\app' })]
    const projects = listProjects(sessions)
    expect(projects).toHaveLength(1)
    expect(projects[0].id).toBe(projectIdForPath('C:\\work\\app'))
    expect(projects[0].sessionCount).toBe(1)

    removeProject(projectIdForPath('C:\\work\\app'))
    expect(listProjects(sessions).find((p) => p.rootPath === 'C:\\work\\app')?.name).toBe('app')
  })
})
