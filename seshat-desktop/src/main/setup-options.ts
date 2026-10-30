/** Where an option stands on this computer. */
export type InstalledFlags = {
  /** Its files are already here: choosing it downloads nothing. */
  installed: boolean
  /** It is the one in use now. */
  active: boolean
}

/** The options of a component, each marked with whether its files are already on this computer and whether it is the one in use. */
export function withInstalled<T extends { id: string }>(options: T[], installedIds: readonly string[], activeId?: string): Array<T & InstalledFlags> {
  const installed = new Set(installedIds)
  return options.map((option) => ({ ...option, installed: installed.has(option.id), active: option.id === activeId && installed.has(option.id) }))
}
