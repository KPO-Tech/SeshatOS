import type { UiError, UiNode } from './types'

// The pure part of the forms of an answer (ADR 0013): which fields a Form holds, what its Submit sends, and what is refused. Nothing here
// runs code from the answer: a template is text with {{name}} where the text of a field goes, filled by one pass of replacement.

export const FORM_LIMITS = {
  /** Fields (TextArea, Field) in one Form. */
  fields: 12,
  /** Characters of the template of a Submit. */
  template: 4000,
  /** Characters of the text a field starts with, and the most the reader can type in it. */
  initialValue: 4000,
  typed: 8000,
  /** Characters of the message a Submit sends, whatever the reader wrote: a longer one is cut. */
  message: 12000,
  /** Characters of a name of a field. */
  name: 32
} as const

/** A field is named like an identifier: it appears in a template as {{name}}. */
export const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*$/

const FIELD_COMPONENTS = ['TextArea', 'Field'] as const
// What only makes sense inside a Form.
const FORM_ONLY = [...FIELD_COMPONENTS, 'Counter', 'Submit'] as const

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g

/** The nodes held by the props of a node, at any depth, except the inside of a nested Form. */
function childrenOf(node: UiNode): UiNode[] {
  const found: UiNode[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (isNodeLike(value)) found.push(value)
  }
  Object.values(node.props).forEach(visit)
  return found
}

function isNodeLike(value: unknown): value is UiNode {
  return typeof value === 'object' && value !== null && (value as UiNode).kind === 'element'
}

/** The nodes below a node, in order, not entering a Form inside it (a Form is its own world). */
export function descendants(node: UiNode, into: UiNode[] = []): UiNode[] {
  for (const child of childrenOf(node)) {
    into.push(child)
    if (child.name !== 'Form') descendants(child, into)
  }
  return into
}

export type FieldSpec = { name: string; kind: 'TextArea' | 'Field'; value: string }

/** The fields a Form holds, in the order they are drawn. */
export function fieldsOf(form: UiNode): FieldSpec[] {
  const fields: FieldSpec[] = []
  for (const node of descendants(form)) {
    if (node.name !== 'TextArea' && node.name !== 'Field') continue
    const name = typeof node.props.name === 'string' ? node.props.name.trim() : ''
    if (!FIELD_NAME.test(name)) continue
    fields.push({ name, kind: node.name, value: typeof node.props.value === 'string' ? node.props.value.slice(0, FORM_LIMITS.initialValue) : '' })
  }
  return fields
}

/** The names a template uses. */
export function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1])
}

/**
 * The message a Submit sends: the template, with {{name}} replaced by the text of the field of that name. One pass: what a field holds is
 * never read as a placeholder, and a name that is no field gives nothing. The result is cut at the limit.
 */
export function fillTemplate(template: string, valueOf: (name: string) => string | undefined): string {
  const message = template.replace(PLACEHOLDER, (_whole, name: string) => (valueOf(name) ?? '').trim())
  return message.length > FORM_LIMITS.message ? message.slice(0, FORM_LIMITS.message) : message
}

/** Words of a text, as a reader counts them: runs of characters between blanks. */
export function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

/** Where a Counter stands against the words it asks for: under the minimum, inside, or over the maximum. */
export function counterState(count: number, min?: number, max?: number): 'under' | 'inside' | 'over' | 'none' {
  if (min === undefined && max === undefined) return 'none'
  if (min !== undefined && count < min) return 'under'
  if (max !== undefined && count > max) return 'over'
  return 'inside'
}

/**
 * What is wrong with the forms of an answer, for the report of the parser. The form is still drawn: the view keeps to the same limits (a
 * field that is not named well is left out, a placeholder that names no field gives nothing, a text is cut), so a mistake costs a
 * message, not the answer.
 */
export function checkForms(root: UiNode): UiError[] {
  const errors: UiError[] = []
  const problem = (message: string, hint?: string) => errors.push({ code: 'bad-argument', message, hint })

  const forms = [root, ...descendants(root)].filter((node) => node.name === 'Form')
  for (const form of forms) {
    const names = new Set<string>()
    const inside = descendants(form)
    if (inside.some((node) => node.name === 'Form')) problem('A Form cannot hold another Form.')
    let fieldCount = 0
    for (const node of inside) {
      if (node.name !== 'TextArea' && node.name !== 'Field') continue
      fieldCount += 1
      const name = typeof node.props.name === 'string' ? node.props.name.trim() : ''
      if (!FIELD_NAME.test(name) || name.length > FORM_LIMITS.name) problem(`The name "${name}" of a field is not valid.`, 'Use letters, digits and _, starting with a letter, as essay or answer_1.')
      else if (names.has(name)) problem(`The field name "${name}" is used twice in a Form.`)
      names.add(name)
      if (typeof node.props.value === 'string' && node.props.value.length > FORM_LIMITS.initialValue) problem(`The text a field "${name}" starts with is too long.`)
    }
    if (fieldCount > FORM_LIMITS.fields) problem(`A Form holds at most ${FORM_LIMITS.fields} fields.`)

    for (const node of inside) {
      if (node.name === 'Counter' && typeof node.props.of === 'string' && !names.has(node.props.of)) problem(`A Counter counts "${node.props.of}", which is no field of the Form.`)
    }
    const submit = isNodeLike(form.props.submit) ? form.props.submit : null
    if (submit) {
      const template = typeof submit.props.template === 'string' ? submit.props.template : ''
      if (template.length > FORM_LIMITS.template) problem(`The template of a Submit is longer than ${FORM_LIMITS.template} characters.`)
      for (const used of new Set(placeholdersOf(template))) {
        if (!names.has(used)) problem(`The template of the Submit uses {{${used}}}, which is no field of the Form.`)
      }
      const requires = Array.isArray(submit.props.requires) ? submit.props.requires : []
      for (const required of requires) {
        if (typeof required === 'string' && !names.has(required)) problem(`Submit requires "${required}", which is no field of the Form.`)
      }
    }
  }

  // A field, a Counter or a Submit alone, outside a Form, can do nothing.
  const inForms = new Set<UiNode>()
  for (const form of forms) {
    descendants(form).forEach((node) => inForms.add(node))
    if (isNodeLike(form.props.submit)) inForms.add(form.props.submit)
  }
  for (const node of [root, ...descendants(root)]) {
    if ((FORM_ONLY as readonly string[]).includes(node.name) && !inForms.has(node)) problem(`${node.name} only works inside a Form.`)
  }
  return errors
}
