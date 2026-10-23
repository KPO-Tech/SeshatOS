import type { StoreApp } from './storeCatalog'

export type StoreSections = {
  featured: StoreApp | null
  available: StoreApp[]
  soon: StoreApp[]
}

// An app with a route can be opened; the others are announced. The featured one is shown large and not repeated in the lists.
export function storeSections(apps: readonly StoreApp[]): StoreSections {
  const featured = apps.find((app) => app.featured) ?? null
  const rest = apps.filter((app) => app !== featured)
  return {
    featured,
    available: rest.filter((app) => app.route),
    soon: rest.filter((app) => !app.route)
  }
}
