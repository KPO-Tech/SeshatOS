import type { EnvVarDef, EnvVarGroup } from './environmentTypes'

export function groupEnvVars(catalog: EnvVarDef[]): EnvVarGroup[] {
  const order: string[] = []
  const groups = new Map<string, EnvVarGroup>()

  catalog.forEach((def) => {
    if (def.hidden) return
    if (!groups.has(def.group)) {
      groups.set(def.group, { id: def.group, label: def.groupLabel, defs: [] })
      order.push(def.group)
    }
    groups.get(def.group)?.defs.push(def)
  })

  return order.map((id) => groups.get(id)).filter(Boolean) as EnvVarGroup[]
}
