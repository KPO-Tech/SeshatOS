import { CELL_COMPONENTS, SPEC_BY_NAME } from '../catalog/specs'
import type { ArgType, ComponentSpec } from '../catalog/types'
import { parseStatements } from './parseStatements'
import type { Statement, UiAction, UiError, UiErrorCode, UiNode, UiResult, Value } from './types'

const FAIL = Symbol('fail')
type Outcome<T> = T | typeof FAIL

const ACTIONS: Record<string, { min: number; max: number }> = {
  Ask: { min: 1, max: 2 },
  OpenFile: { min: 1, max: 3 },
  OpenUrl: { min: 1, max: 1 }
}

interface Context {
  statements: Map<string, Statement>
  streaming: boolean
  errors: UiError[]
  unresolved: Set<string>
  /** Statements being read, innermost last: the one a problem belongs to. */
  stack: string[]
}

function report(ctx: Context, code: UiErrorCode, message: string, hint?: string): void {
  const name = ctx.stack[ctx.stack.length - 1]
  const statement = name ? ctx.statements.get(name) : undefined
  if (ctx.streaming && statement?.open) return
  ctx.errors.push({ code, statement: name, message, hint })
}

/**
 * Turns the text of a `seshat-ui` block into a tree of catalog components.
 * It never throws: a broken piece is dropped and reported, the rest is kept.
 */
export function parseUi(src: string, options: { streaming: boolean }): UiResult {
  const { statements, errors } = parseStatements(src, options.streaming)
  const ctx: Context = { statements, streaming: options.streaming, errors, unresolved: new Set(), stack: [] }

  const entry = statements.get('root')
  if (!entry) {
    if (!options.streaming) {
      errors.push({ code: 'no-root', message: 'There is no root statement.', hint: 'Start with root = Stack([...]).' })
    }
    return { root: null, errors, unresolved: [] }
  }

  ctx.stack.push('root')
  const root = materialize(entry.value, { t: 'node' }, ctx)
  ctx.stack.pop()

  if (root === FAIL) return { root: null, errors, unresolved: [...ctx.unresolved] }
  if (!isNode(root)) {
    report(ctx, 'root-not-component', 'root must be a component.')
    return { root: null, errors, unresolved: [...ctx.unresolved] }
  }
  return { root, errors, unresolved: [...ctx.unresolved] }
}

export function isNode(value: unknown): value is UiNode {
  return typeof value === 'object' && value !== null && (value as UiNode).kind === 'element'
}

function materialize(value: Value, type: ArgType, ctx: Context): Outcome<unknown> {
  if (value.k === 'ref') return followReference(value.name, type, ctx)

  switch (type.t) {
    case 'string':
      if (value.k === 'str') return value.v
      if (value.k === 'num') return String(value.v)
      return mismatch(ctx, 'text', value)
    case 'number': {
      if (value.k === 'num') return value.v
      if (value.k === 'str' && value.v.trim() !== '' && Number.isFinite(Number(value.v))) return Number(value.v)
      return mismatch(ctx, 'number', value)
    }
    case 'boolean':
      if (value.k === 'bool') return value.v
      if (value.k === 'str' && (value.v === 'true' || value.v === 'false')) return value.v === 'true'
      return mismatch(ctx, 'true or false', value)
    case 'scalar':
      if (value.k === 'str' || value.k === 'num') return value.v
      return mismatch(ctx, 'text or number', value)
    case 'enum': {
      if (value.k === 'str') {
        const found = type.values.find((allowed) => allowed === value.v.trim().toLowerCase())
        if (found) return found
      }
      return mismatch(ctx, `one of ${type.values.join(', ')}`, value)
    }
    case 'list':
      return materializeList(value, type.item, ctx)
    case 'cell':
      if (value.k === 'str' || value.k === 'num') return value.v
      return materialize(value, { t: 'node', of: CELL_COMPONENTS }, ctx)
    case 'action':
      return materializeAction(value, ctx)
    case 'node':
      return materializeNode(value, type.of, ctx)
  }
}

function followReference(name: string, type: ArgType, ctx: Context): Outcome<unknown> {
  const target = ctx.statements.get(name)
  if (!target) {
    ctx.unresolved.add(name)
    if (!ctx.streaming) report(ctx, 'unresolved-reference', `${name} is used but never defined.`)
    return FAIL
  }
  if (ctx.stack.includes(name)) {
    report(ctx, 'cycle', `${name} refers to itself.`)
    return FAIL
  }
  ctx.stack.push(name)
  const result = materialize(target.value, type, ctx)
  ctx.stack.pop()
  return result
}

function materializeList(value: Value, item: ArgType, ctx: Context): Outcome<unknown[]> {
  if (value.k !== 'arr') {
    if (item.t === 'node' || item.t === 'cell') {
      const single = materialize(value, item, ctx)
      return single === FAIL ? FAIL : [single]
    }
    return mismatch(ctx, 'a list', value)
  }
  const out: unknown[] = []
  for (const entry of value.items) {
    const done = materialize(entry, item, ctx)
    if (done !== FAIL) out.push(done)
  }
  return out
}

function materializeNode(value: Value, only: readonly string[] | undefined, ctx: Context): Outcome<UiNode> {
  if (value.k !== 'call') return mismatch(ctx, 'a component', value)
  const spec = SPEC_BY_NAME.get(value.name)
  if (!spec) {
    report(ctx, 'unknown-component', `Unknown component ${value.name}.`, `Available components: ${[...SPEC_BY_NAME.keys()].join(', ')}`)
    return FAIL
  }
  if (only && !only.includes(spec.name)) {
    report(ctx, 'wrong-component', `${spec.name} is not allowed here.`, `Expected: ${only.join(', ')}`)
    return FAIL
  }
  return materializeCall(spec, value.args, ctx)
}

function materializeCall(spec: ComponentSpec, args: Value[], ctx: Context): Outcome<UiNode> {
  if (args.length > spec.args.length) {
    report(ctx, 'extra-arguments', `${spec.name} takes ${spec.args.length} arguments, ${args.length} were given.`)
  }
  const props: Record<string, unknown> = {}
  for (let i = 0; i < spec.args.length; i++) {
    const arg = spec.args[i]
    const given = args[i]
    if (given === undefined || given.k === 'null') {
      if (arg.optional) continue
      report(ctx, 'missing-argument', `${spec.name} needs "${arg.name}".`, signature(spec))
      return FAIL
    }
    const done = materialize(given, arg.type, ctx)
    if (done === FAIL) {
      if (arg.optional) continue
      return FAIL
    }
    props[arg.name] = done
  }
  return { kind: 'element', name: spec.name, props }
}

function materializeAction(value: Value, ctx: Context): Outcome<UiAction> {
  if (value.k !== 'action') return mismatch(ctx, 'an action such as @Ask("...")', value)
  const rule = ACTIONS[value.name]
  if (!rule) {
    report(ctx, 'bad-argument', `Unknown action @${value.name}.`, `Available actions: ${Object.keys(ACTIONS).map((name) => `@${name}`).join(', ')}`)
    return FAIL
  }
  if (value.args.length < rule.min || value.args.length > rule.max) {
    report(ctx, 'bad-argument', `@${value.name} takes ${rule.min === rule.max ? rule.min : `${rule.min} to ${rule.max}`} arguments.`)
    return FAIL
  }
  const args: Array<string | number> = []
  for (const arg of value.args) {
    const done = materialize(arg, { t: 'scalar' }, ctx)
    if (done === FAIL) return FAIL
    args.push(done as string | number)
  }
  if (value.name === 'OpenUrl' && !/^https?:\/\//i.test(String(args[0]))) {
    report(ctx, 'bad-argument', '@OpenUrl only opens http and https addresses.')
    return FAIL
  }
  return { kind: 'action', name: value.name as UiAction['name'], args }
}

function mismatch(ctx: Context, expected: string, value: Value): typeof FAIL {
  report(ctx, 'bad-argument', `Expected ${expected}, got ${describe(value)}.`)
  return FAIL
}

function describe(value: Value): string {
  switch (value.k) {
    case 'str': return 'text'
    case 'num': return 'a number'
    case 'bool': return 'true or false'
    case 'null': return 'null'
    case 'arr': return 'a list'
    case 'obj': return 'an object'
    case 'call': return `the component ${value.name}`
    case 'action': return `the action @${value.name}`
    case 'ref': return `the name ${value.name}`
  }
}

function signature(spec: ComponentSpec): string {
  return `${spec.name}(${spec.args.map((arg) => (arg.optional ? `${arg.name}?` : arg.name)).join(', ')})`
}
