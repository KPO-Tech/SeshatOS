import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchSkills } from './skillsApi'
import type { Skill } from './skillsTypes'

export type SkillFilters = {
  query: string
  collection: string
  enabledOnly: boolean
}

export function filterSkills(skills: Skill[], { query, collection, enabledOnly }: SkillFilters): Skill[] {
  const needle = query.trim().toLowerCase()
  return skills.filter((skill) => {
    if (enabledOnly && !skill.enabled) return false
    if (collection !== 'all' && skill.collection !== collection) return false
    if (!needle) return true
    return `${skill.display_name} ${skill.name} ${skill.description}`.toLowerCase().includes(needle)
  })
}

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setSkills((await fetchSkills()).filter((skill) => !skill.is_hidden))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const collections = useMemo(() => [...new Set(skills.map((skill) => skill.collection).filter(Boolean))].sort(), [skills])

  return { skills, collections, loading, error, reload }
}
