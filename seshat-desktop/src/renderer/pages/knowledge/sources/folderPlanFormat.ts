import type { TFunction } from 'i18next'
import type { CreatedCollection, FolderPlan } from './folderPlanApi'

/** A size for a person: "12 KB", "3.4 MB". */
export function formatSize(bytes: number, t: TFunction): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.unit.b')}`
  const units = [t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.unit.b'), t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.unit.kb'), t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.unit.mb'), t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.unit.gb'), t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.unit.tb')]
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

// The values are keys of the catalogue: reasonLabel translates them.
const REASON_LABELS: Record<string, string> = {
  hidden: 'knowledge/sources:pages.knowledge.sources.folderPlanFormat.reason.hidden',
  'system or temporary file': 'knowledge/sources:pages.knowledge.sources.folderPlanFormat.reason.system',
  'empty file': 'knowledge/sources:pages.knowledge.sources.folderPlanFormat.reason.empty',
  'symbolic link': 'knowledge/sources:pages.knowledge.sources.folderPlanFormat.reason.link',
  'format the reader does not handle': 'knowledge/sources:pages.knowledge.sources.folderPlanFormat.reason.format',
  'removed from the plan': 'knowledge/sources:pages.knowledge.sources.folderPlanFormat.reason.removed',
  'path outside the archive': 'knowledge/sources:pages.knowledge.sources.folderPlanFormat.reason.outside',
  unreadable: 'knowledge/sources:pages.knowledge.sources.folderPlanFormat.reason.unreadable'
}

/** The reason a file was left out, in words a person reads; an unknown reason is shown as it came. */
export function reasonLabel(reason: string, t: TFunction): string {
  if (reason.startsWith('unreadable')) return t(REASON_LABELS.unreadable)
  const key = REASON_LABELS[reason]
  return key ? t(key) : reason
}

/** The reasons of a plan, the most frequent first. */
export function reasonsOf(plan: Pick<FolderPlan, 'excluded_by_reason'>, t: TFunction): Array<{ reason: string; label: string; count: number }> {
  return Object.entries(plan.excluded_by_reason)
    .map(([reason, count]) => ({ reason, label: reasonLabel(reason, t), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** "659 files found: 57 collections, 12 left out, 3 duplicates." */
export function planSentence(plan: FolderPlan, t: TFunction): string {
  const inCollections = plan.collections.reduce((sum, c) => sum + c.file_count, 0)
  const parts = [t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.filesInCollections', { files: t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.fileCount', { count: inCollections }), collections: t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.collectionCount', { count: plan.collections.length }) })]
  if (plan.excluded_count > 0) parts.push(t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.leftOutCount', { count: plan.excluded_count }))
  if (plan.duplicate_count > 0) parts.push(t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.duplicateCount', { count: plan.duplicate_count }))
  return parts.join(', ')
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
export function createdSentence(collections: CreatedCollection[], t: TFunction): string {
  const files = collections.reduce((sum, c) => sum + c.file_count, 0)
  return t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.createdSentence', { count: collections.length, files: t('knowledge/sources:pages.knowledge.sources.folderPlanFormat.fileCount', { count: files }) })
}
