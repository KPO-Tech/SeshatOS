import type { ArgType, ComponentSpec } from './types'
import { brandIconNames, genericIconNames } from '../view/icons/iconCatalog'
import { PROMPT_EXAMPLES } from './examples'
import { COMPONENT_SPECS, SPEC_BY_NAME } from './specs'

export interface PromptComponent {
  name: string
  group: string
  signature: string
  description: string
}

export interface PromptSpec {
  version: 1
  components: PromptComponent[]
  /** What an icon argument may be: names of generic icons, and slugs of technology logos (written si:slug). */
  icons: { names: string[]; brands: string[] }
  examples: string[]
}

function typeLabel(type: ArgType): string {
  switch (type.t) {
    case 'string': return 'text'
    case 'number': return 'number'
    case 'boolean': return 'true|false'
    case 'scalar': return 'text|number'
    case 'enum': return type.values.join('|')
    case 'node': return type.of ? type.of.join('|') : 'Component'
    case 'list': return `[${typeLabel(type.item)}]`
    case 'cell': return 'text|number|Badge|FileRef|Link'
    case 'action': return '@Ask("text")|@OpenFile(path)|@OpenUrl(url)'
    case 'target': return 'name'
    case 'icon': return 'icon'
  }
}

function signature(spec: ComponentSpec): string {
  const args = spec.args.map((arg) => `${arg.name}${arg.optional ? '?' : ''}: ${typeLabel(arg.type)}`)
  return `${spec.name}(${args.join(', ')})`
}

function collectNames(type: ArgType, into: Set<string>): void {
  if (type.t === 'node' && type.of) type.of.forEach((name) => into.add(name))
  if (type.t === 'list') collectNames(type.item, into)
  if (type.t === 'cell') ['Badge', 'FileRef', 'Link'].forEach((name) => into.add(name))
}

/** The components the model is told about: the ones the app draws, and the pieces those take as arguments. */
export function taughtComponents(drawn: readonly string[]): ComponentSpec[] {
  const names = new Set(drawn.filter((name) => SPEC_BY_NAME.has(name)))
  // A Set visits what is added while it is walked, so the pieces of a piece are taught too.
  for (const name of names) {
    for (const arg of SPEC_BY_NAME.get(name)?.args ?? []) collectNames(arg.type, names)
  }
  return COMPONENT_SPECS.filter((spec) => names.has(spec.name))
}

export function buildPromptSpec(drawn: readonly string[]): PromptSpec {
  return {
    version: 1,
    components: taughtComponents(drawn).map((spec) => ({
      name: spec.name,
      group: spec.group,
      signature: signature(spec),
      description: spec.description
    })),
    icons: { names: genericIconNames(), brands: brandIconNames() },
    examples: PROMPT_EXAMPLES
  }
}
