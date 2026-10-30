import type { Edition } from '@renderer/lib/edition'

/** The sections of Config that an edition hides (see lib/edition.ts). Everything else is shown, whatever the edition. */
export function hiddenConfigSections(edition: Edition): Array<'cloud'> {
  return edition.cloud ? [] : ['cloud']
}
