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
  /** The name of a statement, written in quotes or bare. It is not followed: it points at the element that statement made. */
  | { t: 'target' }
  /** The name of an icon (see view/icons), kept as text: an unknown one draws nothing. */
  | { t: 'icon' }

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
