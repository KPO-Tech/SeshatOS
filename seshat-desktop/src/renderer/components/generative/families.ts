import { COMPONENT_SPECS } from '@renderer/components/chat/richblocks/catalog/specs'

/** The families a person recognises, over the groups of the catalogue. */
export const FAMILIES = ['basics', 'charts', 'forms', 'design', 'architecture'] as const
export type Family = (typeof FAMILIES)[number]

const GROUP_FAMILY: Record<string, Family> = { Charts: 'charts', Forms: 'forms', Design: 'design', Architecture: 'architecture', Relations: 'architecture' }
const FAMILY_OF_COMPONENT = new Map(COMPONENT_SPECS.map((spec) => [spec.name, GROUP_FAMILY[spec.group] ?? 'basics'] as const))

/** The families an example draws from: those of the components it calls. */
export function familiesOf(code: string): Family[] {
  const found = new Set<Family>()
  for (const match of code.matchAll(/\b([A-Z][A-Za-z]+)\(/g)) {
    const family = FAMILY_OF_COMPONENT.get(match[1])
    if (family && family !== 'basics') found.add(family)
  }
  return found.size > 0 ? [...found] : ['basics']
}
