export type Value =
  | { k: 'str'; v: string }
  | { k: 'num'; v: number }
  | { k: 'bool'; v: boolean }
  | { k: 'null' }
  | { k: 'arr'; items: Value[] }
  | { k: 'obj'; entries: Array<[string, Value]> }
  | { k: 'call'; name: string; args: Value[] }
  | { k: 'action'; name: string; args: Value[] }
  | { k: 'ref'; name: string }
  /** `name = value` inside a call: the argument is given by its name instead of its place. */
  | { k: 'named'; name: string; value: Value }

export interface Statement {
  name: string
  value: Value
  /** The last statement of a text that is still streaming: it may be cut anywhere. */
  open: boolean
}

export type UiErrorCode =
  | 'syntax'
  | 'unclosed'
  | 'unknown-component'
  | 'wrong-component'
  | 'missing-argument'
  | 'bad-argument'
  | 'extra-arguments'
  | 'unresolved-reference'
  | 'cycle'
  | 'no-root'
  | 'root-not-component'

export interface UiError {
  code: UiErrorCode
  /** The statement the problem is in, when there is one. */
  statement?: string
  message: string
  hint?: string
}

export interface UiAction {
  kind: 'action'
  name: 'Ask' | 'OpenFile' | 'OpenUrl'
  args: Array<string | number>
}

export interface UiNode {
  kind: 'element'
  name: string
  props: Record<string, unknown>
}

export interface UiResult {
  root: UiNode | null
  errors: UiError[]
  /** Names used but not defined (yet). While streaming this is normal, not an error. */
  unresolved: string[]
}
