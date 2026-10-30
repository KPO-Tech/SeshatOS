import type { CreatedCollection, FolderPlan } from './folderPlanApi'

/** A size for a person: "12 KB", "3.4 MB". */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

const REASON_LABELS: Record<string, string> = {
  hidden: 'Hidden files and folders',
  'system or temporary file': 'System and temporary files',
  'empty file': 'Empty files',
  'symbolic link': 'Links (not followed)',
  'format the reader does not handle': 'Formats that cannot be read',
  'removed from the plan': 'Removed by you',
  'path outside the archive': 'Outside the folder',
  unreadable: 'Could not be read'
}

/** The reason a file was left out, in words a person reads; an unknown reason is shown as it came. */
export function reasonLabel(reason: string): string {
  if (reason.startsWith('unreadable')) return REASON_LABELS.unreadable
  return REASON_LABELS[reason] ?? reason
}

/** The reasons of a plan, the most frequent first. */
export function reasonsOf(plan: Pick<FolderPlan, 'excluded_by_reason'>): Array<{ reason: string; label: string; count: number }> {
  return Object.entries(plan.excluded_by_reason)
    .map(([reason, count]) => ({ reason, label: reasonLabel(reason), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** "659 files found: 57 collections, 12 left out, 3 duplicates." */
export function planSentence(plan: FolderPlan): string {
  const inCollections = plan.collections.reduce((sum, c) => sum + c.file_count, 0)
  const parts = [`${plural(inCollections, 'file')} in ${plural(plan.collections.length, 'collection')}`]
  if (plan.excluded_count > 0) parts.push(`${plan.excluded_count} left out`)
  if (plan.duplicate_count > 0) parts.push(plural(plan.duplicate_count, 'duplicate'))
  return parts.join(', ')
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`
}

/** A name for the collection that merging these would make: the name of the biggest one. */
export function suggestedMergeName(plan: Pick<FolderPlan, 'collections'>, indexes: number[]): string {
  const chosen = plan.collections.filter((c) => indexes.includes(c.index))
  if (chosen.length === 0) return ''
  return [...chosen].sort((a, b) => b.file_count - a.file_count)[0].name
}

/** The last segments of a path, so that a long folder fits in a line: ".../Archive/2021". */
export function shortPath(path: string, keep = 2): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.length <= keep ? path : `.../${parts.slice(-keep).join('/')}`
}

/** "5 collections created, 193 files waiting to be indexed." */
export function createdSentence(collections: CreatedCollection[]): string {
  const files = collections.reduce((sum, c) => sum + c.file_count, 0)
  return `${plural(collections.length, 'collection')} created, ${plural(files, 'file')} waiting to be indexed.`
}
