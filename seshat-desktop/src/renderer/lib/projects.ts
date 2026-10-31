import type { ChatSession } from '@renderer/stores/session'

const PROJECTS_STORAGE_KEY = 'seshat.projects.v1'

// The colours a project can take, for the tile of its card. The first one follows the accent of the theme.
export const PROJECT_COLORS = ['orange', 'blue', 'purple', 'green', 'yellow', 'gray'] as const
export type ProjectColor = (typeof PROJECT_COLORS)[number]

function isProjectColor(value: unknown): value is ProjectColor {
  return typeof value === 'string' && (PROJECT_COLORS as readonly string[]).includes(value)
}

/** What a person says about a project, kept on this computer with the folder it names. */
export type ProjectDetails = {
  name?: string
  description?: string
  tags?: string[]
  color?: ProjectColor
  pinned?: boolean
  archived?: boolean
}

type StoredProject = ProjectDetails & {
  id: string
  rootPath: string
}

export type ProjectSummary = {
  id: string
  name: string
  rootPath: string
  sessionCount: number
  lastActiveAt: string | null
  description: string
  tags: string[]
  color: ProjectColor
  pinned: boolean
  archived: boolean
  /** How many of its conversations are writing an answer right now. */
  activeSessionCount: number
  /** The conversation of the project that was last active, to go on with. */
  lastSessionId: string | null
}

// A project that was never given a colour takes one from its path, so the same folder looks the same every time and a page of projects
// is not a page of one colour. Grey is left to be chosen.
export function defaultProjectColor(rootPath: string): ProjectColor {
  let hash = 0
  for (const char of normalizeProjectPath(rootPath).toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PROJECT_COLORS[hash % (PROJECT_COLORS.length - 1)]
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

function readStoredProjects(): StoredProject[] {
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
      .map((item) => ({
        ...item,
        id: projectIdForPath(item.rootPath),
        // What was stored by hand or by an older version is read for what it is worth, never trusted.
        tags: Array.isArray(item.tags) ? item.tags.filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim() !== '') : undefined,
        color: isProjectColor(item.color) ? item.color : undefined,
      }))
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

// Chat sessions for the Recents list: no knowledge one-offs, and only
// those of the current project (or the ones outside any project).
export function selectRecentSessions(sessions: ChatSession[], projectContextPath: string | null, limit = 12): ChatSession[] {
  return sessions
    .filter((s) => s.source !== 'knowledge')
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
export function listProjects(sessions: ChatSession[], streaming: Record<string, boolean> = {}): ProjectSummary[] {
  const byId = new Map<string, ProjectSummary>()

  for (const stored of readStoredProjects()) {
    byId.set(stored.id, {
      id: stored.id,
      name: stored.name?.trim() || basenameOfPath(stored.rootPath),
      rootPath: normalizeProjectPath(stored.rootPath),
      sessionCount: 0,
      lastActiveAt: null,
      description: stored.description?.trim() ?? '',
      tags: stored.tags ?? [],
      color: stored.color ?? defaultProjectColor(stored.rootPath),
      pinned: stored.pinned === true,
      archived: stored.archived === true,
      activeSessionCount: 0,
      lastSessionId: null,
    })
  }

  for (const session of sessions) {
    if (!session.projectPath) continue
    const id = projectIdForPath(session.projectPath)
    const activeAt = session.updatedAt || session.createdAt
    let project = byId.get(id)
    if (!project) {
      project = {
        id,
        name: basenameOfPath(session.projectPath),
        rootPath: normalizeProjectPath(session.projectPath),
        sessionCount: 0,
        lastActiveAt: null,
        description: '',
        tags: [],
        color: defaultProjectColor(session.projectPath),
        pinned: false,
        archived: false,
        activeSessionCount: 0,
        lastSessionId: null,
      }
      byId.set(id, project)
    }
    project.sessionCount += 1
    if (streaming[session.id]) project.activeSessionCount += 1
    if (!project.lastActiveAt || activeAt > project.lastActiveAt) {
      project.lastActiveAt = activeAt
      project.lastSessionId = session.id
    }
  }

  return [...byId.values()].sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''))
}

// Says something about a project (its description, tags, colour, whether it is pinned or archived). A project that was only ever implied
// by the sessions that used its folder is promoted to a stored one, as renaming does.
export function updateProject(id: string, rootPath: string, details: ProjectDetails): void {
  const list = readStoredProjects()
  const index = list.findIndex((item) => item.id === id)
  const clean: ProjectDetails = { ...details }
  if (clean.name !== undefined) clean.name = clean.name.trim() || undefined
  if (clean.description !== undefined) clean.description = clean.description.trim() || undefined
  if (clean.tags !== undefined) clean.tags = [...new Set(clean.tags.map((tag) => tag.trim()).filter(Boolean))]
  if (index === -1) {
    writeStoredProjects([...list, { id, rootPath: normalizeProjectPath(rootPath), ...clean }])
    return
  }
  const next = [...list]
  next[index] = { ...next[index], ...clean }
  writeStoredProjects(next)
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
