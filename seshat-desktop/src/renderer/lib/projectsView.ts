import type { ProjectSummary } from './projects'

export type ProjectTab = 'all' | 'recent' | 'pinned' | 'active' | 'archived'
export type ProjectSort = 'recent' | 'name-asc' | 'name-desc' | 'sessions'

export const PROJECT_TABS: ReadonlyArray<{ id: ProjectTab; label: string }> = [
  { id: 'all', label: 'All projects' },
  { id: 'recent', label: 'Recent' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' }
]

export const PROJECT_SORTS: ReadonlyArray<{ id: ProjectSort; label: string }> = [
  { id: 'recent', label: 'Last active' },
  { id: 'name-asc', label: 'Name A to Z' },
  { id: 'name-desc', label: 'Name Z to A' },
  { id: 'sessions', label: 'Most conversations' }
]

/** A project is recent when it was active in the last week. */
export const RECENT_DAYS = 7
const DAY_MS = 86_400_000

function isRecent(project: ProjectSummary, now: number): boolean {
  if (!project.lastActiveAt) return false
  const at = Date.parse(project.lastActiveAt)
  return !Number.isNaN(at) && now - at <= RECENT_DAYS * DAY_MS
}

/** The projects a tab holds. Archived ones are only in their own tab: every other tab is about what is still in use. */
export function inTab(project: ProjectSummary, tab: ProjectTab, now: number): boolean {
  if (tab === 'archived') return project.archived
  if (project.archived) return false
  switch (tab) {
    case 'all':
      return true
    case 'recent':
      return isRecent(project, now)
    case 'pinned':
      return project.pinned
    case 'active':
      return project.activeSessionCount > 0
  }
}

export function countTabs(projects: ProjectSummary[], now: number): Record<ProjectTab, number> {
  const counts: Record<ProjectTab, number> = { all: 0, recent: 0, pinned: 0, active: 0, archived: 0 }
  for (const tab of PROJECT_TABS) counts[tab.id] = projects.filter((project) => inTab(project, tab.id, now)).length
  return counts
}

/** Every word of the search has to be found in the name, the folder, the description or a tag. */
function matches(project: ProjectSummary, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [project.name, project.rootPath, project.description, ...project.tags].join('\n').toLowerCase()
  return words.every((word) => haystack.includes(word))
}

const byName = (a: ProjectSummary, b: ProjectSummary) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

/** The projects of a tab that match the search, pinned ones first, then in the order asked. The list it is given is left as it was. */
export function arrangeProjects(projects: ProjectSummary[], view: { tab: ProjectTab; query: string; sort: ProjectSort }, now: number): ProjectSummary[] {
  return projects
    .filter((project) => inTab(project, view.tab, now) && matches(project, view.query))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      switch (view.sort) {
        case 'name-asc':
          return byName(a, b)
        case 'name-desc':
          return byName(b, a)
        case 'sessions':
          return b.sessionCount - a.sessionCount || byName(a, b)
        case 'recent':
          return (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '') || byName(a, b)
      }
    })
}

/** "2 hours ago", for the last activity of a project; empty when there was none. */
export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return ''
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 60) return 'just now'
  const unit = (count: number, name: string) => `${count} ${name}${count === 1 ? '' : 's'} ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return unit(minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return unit(hours, 'hour')
  const days = Math.floor(hours / 24)
  if (days < 7) return unit(days, 'day')
  if (days < 30) return unit(Math.floor(days / 7), 'week')
  if (days < 365) return unit(Math.floor(days / 30), 'month')
  return unit(Math.floor(days / 365), 'year')
}

/** "128 files", "5000+ files": the count of a folder, which stops at a limit. */
export function fileCountLabel(count: number | undefined, capped: boolean): string {
  if (count === undefined) return '- files'
  const text = `${count}${capped ? '+' : ''}`
  return `${text} ${count === 1 && !capped ? 'file' : 'files'}`
}

/** Tags as typed ("data, analyse  immobilier"): split on commas, trimmed, without doubles. */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,;\n]/).map((tag) => tag.trim()).filter(Boolean))]
}
