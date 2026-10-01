import type { ChatSession } from '@renderer/stores/session'

const PROJECTS_STORAGE_KEY = 'seshat.projects.v1'

export type StoredProject = {
  id: string
  rootPath: string
  name?: string
}

export type ProjectSummary = {
  id: string
  name: string
  rootPath: string
  sessionCount: number
  lastActiveAt: string | null
}

export function normalizeProjectPath(path: string): string {
  return path.trim().replace(/[\\/]+$/, '')
}

function basenameOfPath(path: string): string {
  const normalized = normalizeProjectPath(path)
  const segments = normalized.split(/[\\/]+/).filter(Boolean)
  return segments.at(-1) || normalized
}

// The same id a project gets whether it was explicitly added (readStoredProjects)
// or only ever showed up as a session's projectPath - so the two always merge
// into one entry in listProjects() instead of the same folder appearing twice.
export function projectIdForPath(path: string): string {
  return `path-${normalizeProjectPath(path).toLowerCase()}`
}

export function readStoredProjects(): StoredProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    // id is always re-derived from rootPath here rather than trusted as
    // persisted - it exists purely as a cache of projectIdForPath(rootPath),
    // and a record added before some past normalizeProjectPath fix could
    // otherwise carry a stale id that no longer matches what the same path
    // computes today. That mismatch broke two things at once: the same
    // folder showing up twice (this record failing to merge with the one
    // derived live from a session's projectPath) and delete silently doing
    // nothing (removeProject's id never matching the stale stored one).
    return parsed
      .filter((item): item is StoredProject => typeof item?.rootPath === 'string')
      .map((item) => ({ ...item, id: projectIdForPath(item.rootPath) }))
  } catch {
    return []
  }
}

function writeStoredProjects(projects: StoredProject[]) {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
}

function readStoredProjectPath(projectId: string | null): string | null {
  if (!projectId) return null
  return readStoredProjects().find((item) => item.id === projectId)?.rootPath ?? null
}

// The sidebar's Recents are scoped to a project when the current URL points at
// one (?project=, /projects/:id or /conversation/:id of a project session).
export function resolveProjectContextPath(
  params: { projectParam: string | null; projectRouteId?: string; conversationRouteId?: string },
  sessions: ChatSession[]
): string | null {
  if (params.projectParam) return params.projectParam
  if (params.projectRouteId) {
    const decodedId = decodeURIComponent(params.projectRouteId)
    return readStoredProjectPath(decodedId)
      || sessions.find((s) => s.projectPath && projectIdForPath(s.projectPath) === decodedId)?.projectPath
      || null
  }
  if (params.conversationRouteId) {
    return sessions.find((s) => s.id === params.conversationRouteId)?.projectPath || null
  }
  return null
}

// Chat sessions for the Recents list: no knowledge/inbox one-offs, and only
// those of the current project (or the ones outside any project).
export function selectRecentSessions(sessions: ChatSession[], projectContextPath: string | null, limit = 12): ChatSession[] {
  return sessions
    .filter((s) => s.source !== 'knowledge' && s.source !== 'inbox')
    .filter((s) => {
      if (!projectContextPath) return !s.projectPath
      return normalizeProjectPath(s.projectPath ?? '').toLowerCase() === normalizeProjectPath(projectContextPath).toLowerCase()
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, limit)
}

// Every project worth showing on the Projects page: explicitly added ones
// (readStoredProjects) merged with ones that only exist because a session
// picked that folder as its projectPath - a project never has to be
// "created" first to show up here, same spirit as the sidebar's scoping.
export function listProjects(sessions: ChatSession[]): ProjectSummary[] {
  const byId = new Map<string, ProjectSummary>()

  for (const stored of readStoredProjects()) {
    byId.set(stored.id, {
      id: stored.id,
      name: stored.name?.trim() || basenameOfPath(stored.rootPath),
      rootPath: normalizeProjectPath(stored.rootPath),
      sessionCount: 0,
      lastActiveAt: null,
    })
  }

  for (const session of sessions) {
    if (!session.projectPath) continue
    const id = projectIdForPath(session.projectPath)
    const activeAt = session.updatedAt || session.createdAt
    const existing = byId.get(id)
    if (existing) {
      existing.sessionCount += 1
      if (!existing.lastActiveAt || activeAt > existing.lastActiveAt) existing.lastActiveAt = activeAt
      continue
    }
    byId.set(id, {
      id,
      name: basenameOfPath(session.projectPath),
      rootPath: normalizeProjectPath(session.projectPath),
      sessionCount: 1,
      lastActiveAt: activeAt,
    })
  }

  return [...byId.values()].sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''))
}

// Adds (or, for a path that already showed up implicitly, formally registers)
// a project. Idempotent on rootPath - picking the same folder twice updates
// the existing entry instead of creating a duplicate.
export function addProject(rootPath: string, name?: string): StoredProject {
  const id = projectIdForPath(rootPath)
  const list = readStoredProjects()
  const index = list.findIndex((item) => item.id === id)
  const project: StoredProject = { id, rootPath: normalizeProjectPath(rootPath), name: name?.trim() || undefined }
  if (index === -1) {
    writeStoredProjects([...list, project])
  } else {
    const next = [...list]
    next[index] = { ...next[index], ...project }
    writeStoredProjects(next)
  }
  return project
}

export function renameProject(id: string, name: string, rootPath: string): void {
  const list = readStoredProjects()
  const index = list.findIndex((item) => item.id === id)
  if (index === -1) {
    writeStoredProjects([...list, { id, rootPath: normalizeProjectPath(rootPath), name: name.trim() }])
    return
  }
  const next = [...list]
  next[index] = { ...next[index], name: name.trim() }
  writeStoredProjects(next)
}

// Removes the shortcut only - the sessions that used this path keep it, so
// the project reappears (unnamed) in listProjects() as long as any of them
// still exist. There is nothing else to "delete": a project has no data of
// its own beyond this label.
export function removeProject(id: string): void {
  writeStoredProjects(readStoredProjects().filter((item) => item.id !== id))
}
