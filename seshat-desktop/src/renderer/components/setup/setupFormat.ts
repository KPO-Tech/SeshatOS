export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`
}

export type Choice = { install: boolean; modelId: string }
export type SetupComponentId = 'title' | 'speech' | 'ocr'
export type Choices = Partial<Record<SetupComponentId, Choice>>

type Plan = { components: Array<{ id: SetupComponentId; available: boolean; options: Array<{ id: string; sizeBytes: number; installed?: boolean }> }> }

/** What choosing an option downloads: nothing when its files are already on this computer. */
export function bytesToDownload(option: { sizeBytes: number; installed?: boolean }): number {
  return option.installed ? 0 : option.sizeBytes
}

/** What the person has ticked, in bytes: the models only, the engines that run them are small next to them. */
export function totalDownloadBytes(plan: Plan, choices: Choices): number {
  return plan.components.reduce((total, component) => {
    const choice = choices[component.id]
    if (!component.available || !choice?.install) return total
    const option = component.options.find((candidate) => candidate.id === choice.modelId)
    return total + (option ? bytesToDownload(option) : 0)
  }, 0)
}

type ItemProgress = { status: 'waiting' | 'running' | 'done' | 'error'; receivedBytes: number; totalBytes: number }

/**
 * How far the whole setup is, in bytes, when everything downloads at the same time. Each component counts for the size the plan gave
 * it, and for the share of it that has arrived: the sizes the downloads report are only for their own files, and a component that has
 * not said anything yet would otherwise count for nothing. A component that failed leaves the count, it will not arrive.
 */
export function overallProgress(plan: Plan, choices: Choices, progress: Partial<Record<SetupComponentId, ItemProgress>>): { receivedBytes: number; totalBytes: number; percent: number } {
  let receivedBytes = 0
  let totalBytes = 0
  for (const component of plan.components) {
    const choice = choices[component.id]
    if (!component.available || !choice?.install) continue
    const option = component.options.find((candidate) => candidate.id === choice.modelId)
    const expected = option ? bytesToDownload(option) : 0
    const item = progress[component.id]
    if (item?.status === 'error') continue
    totalBytes += expected
    if (item?.status === 'done') receivedBytes += expected
    else if (item && item.totalBytes > 0) receivedBytes += expected * Math.min(1, item.receivedBytes / item.totalBytes)
  }
  const percent = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0
  return { receivedBytes: Math.round(receivedBytes), totalBytes, percent }
}

/**
 * Where the choice starts, for each available component: the model already on this computer when there is one (the one in use first,
 * then the recommended one), the recommended model otherwise. It is ticked, except for a component that says this computer is better
 * left without it (defaultOn false): the person can still tick it, or pick another model of the family and download it.
 */
export function defaultChoices(plan: {
  components: Array<{
    id: SetupComponentId
    available: boolean
    defaultOn?: boolean
    options: Array<{ id: string; recommended: boolean; installed?: boolean; active?: boolean }>
  }>
}): Choices {
  const choices: Choices = {}
  for (const component of plan.components) {
    if (!component.available || component.options.length === 0) continue
    const { options } = component
    const start =
      options.find((option) => option.installed && option.active) ??
      options.find((option) => option.installed && option.recommended) ??
      options.find((option) => option.installed) ??
      options.find((option) => option.recommended) ??
      options[0]
    choices[component.id] = { install: component.defaultOn !== false, modelId: start.id }
  }
  return choices
}

/** A download is only worth starting when it fits with a margin left for the rest of the computer. */
export function fitsOnDisk(totalBytes: number, freeBytes: number | null): boolean {
  if (freeBytes === null) return true
  return totalBytes * 1.2 + 500_000_000 <= freeBytes
}
