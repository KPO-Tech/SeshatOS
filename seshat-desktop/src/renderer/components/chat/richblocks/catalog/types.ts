export type ArgType =
  | { t: 'string' }
  | { t: 'number' }
  | { t: 'boolean' }
  | { t: 'scalar' }
  | { t: 'enum'; values: readonly string[] }
  | { t: 'node'; of?: readonly string[] }
  | { t: 'list'; item: ArgType }
  | { t: 'cell' }
  | { t: 'action' }

export interface ArgSpec {
  name: string
  type: ArgType
  optional?: boolean
}

export interface ComponentSpec {
  name: string
  group: string
  description: string
  args: ArgSpec[]
}
