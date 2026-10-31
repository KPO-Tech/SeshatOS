import { useCallback, useEffect, useState } from 'react'
import { fetchSkillRepos } from './skillsApi'
import type { CatalogEntry } from './skillsTypes'

/** The repositories of skills that can be installed and are not yet. A backend that offers no catalog gives an empty list, not an error. */
export function useSkillCatalog() {
  const [available, setAvailable] = useState<CatalogEntry[]>([])

  const reload = useCallback(async () => {
    try {
      const { catalog } = await fetchSkillRepos()
      setAvailable(catalog.filter((entry) => !entry.installed))
    } catch {
      setAvailable([])
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { available, reload }
}
