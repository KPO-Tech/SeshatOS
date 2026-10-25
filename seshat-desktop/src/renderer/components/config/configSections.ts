import type { Edition } from '@renderer/lib/edition'

/** The sections of Config that an edition hides (see lib/edition.ts). Everything else is shown, whatever the edition. */
export function hiddenConfigSections(edition: Edition): Array<'knowledge' | 'connectors' | 'cloud'> {
  return [...(edition.knowledge ? [] : (['knowledge', 'connectors'] as const)), ...(edition.cloud ? [] : (['cloud'] as const))]
}
