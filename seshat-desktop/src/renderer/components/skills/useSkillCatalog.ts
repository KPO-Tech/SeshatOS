import { useCallback, useEffect, useState } from 'react'
import { fetchSkillRepos } from './skillsApi'
import type { CatalogEntry } from './skillsTypes'

/** The repositories of skills that can be installed and are not yet. A backend that offers no catalog gives an empty list, not an error. */
export function useSkillCatalog() {
  const [available, setAvailable] = useState<CatalogEntry[]>([])
  const [all, setAll] = useState<CatalogEntry[]>([])

  const reload = useCallback(async () => {
    try {
      const { catalog } = await fetchSkillRepos()
      setAvailable(catalog.filter((entry) => !entry.installed))
      setAll(catalog)
    } catch {
      setAvailable([])
      setAll([])
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /** The address of the repository a skill comes from, by the name of its collection (the folder of the repository). */
  const sourceOf = useCallback((collection: string | undefined) => all.find((entry) => entry.name === collection)?.url, [all])

  return { available, reload, sourceOf }
}
