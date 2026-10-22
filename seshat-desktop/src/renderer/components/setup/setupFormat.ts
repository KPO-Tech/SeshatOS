export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`
}

export type Choice = { install: boolean; modelId: string }
export type Choices = Partial<Record<'title' | 'speech', Choice>>

type Plan = { components: Array<{ id: 'title' | 'speech'; available: boolean; options: Array<{ id: string; sizeBytes: number }> }> }

/** What the person has ticked, in bytes: the models only, the engines that run them are small next to them. */
export function totalDownloadBytes(plan: Plan, choices: Choices): number {
  return plan.components.reduce((total, component) => {
    const choice = choices[component.id]
    if (!component.available || !choice?.install) return total
    return total + (component.options.find((option) => option.id === choice.modelId)?.sizeBytes ?? 0)
  }, 0)
}

/** The recommended model of each available component, ticked: where the choice starts. */
export function defaultChoices(plan: {
  components: Array<{ id: 'title' | 'speech'; available: boolean; options: Array<{ id: string; recommended: boolean }> }>
}): Choices {
  const choices: Choices = {}
  for (const component of plan.components) {
    if (!component.available || component.options.length === 0) continue
    const recommended = component.options.find((option) => option.recommended) ?? component.options[0]
    choices[component.id] = { install: true, modelId: recommended.id }
  }
  return choices
}

/** A download is only worth starting when it fits with a margin left for the rest of the computer. */
export function fitsOnDisk(totalBytes: number, freeBytes: number | null): boolean {
  if (freeBytes === null) return true
  return totalBytes * 1.2 + 500_000_000 <= freeBytes
}
