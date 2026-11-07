import { describe, expect, it } from 'vitest'
import { checkForms, counterState, fieldsOf, fillTemplate, FORM_LIMITS, placeholdersOf, wordCount } from './forms'
import { parseUi } from './parseUi'

const FORM = `root = Stack([intro, exercise])
intro = Markdown("Write a short text.")
exercise = Form([essay, count], send, "Day 1")
essay = TextArea("essay", "In my opinion...", 6)
count = Counter("essay", "words", 100, 150)
send = Submit("Correct my text", "Here is my text:\\n\\n{{essay}}")`

describe('a form in an answer', () => {
  it('is read with its fields, its counter and its submit, and nothing is reported', () => {
    const result = parseUi(FORM, { streaming: false })
    expect(result.errors).toEqual([])
    const stack = result.root!
    const form = (stack.props.children as Array<{ name: string }>)[1] as unknown as Parameters<typeof fieldsOf>[0]
    expect(form.name).toBe('Form')
    expect(fieldsOf(form)).toEqual([{ name: 'essay', kind: 'TextArea', value: '' }])
  })

  it('reads the escapes of a string, so that a template can hold new lines', () => {
    const result = parseUi(FORM, { streaming: false })
    const form = (result.root!.props.children as Array<{ props: Record<string, unknown> }>)[1]
    const submit = form.props.submit as { props: { template: string } }
    expect(submit.props.template).toBe('Here is my text:\n\n{{essay}}')
  })

  it('is not checked while it streams: its submit may not be written yet', () => {
    const half = FORM.split('\n').slice(0, 5).join('\n')
    expect(parseUi(half, { streaming: true }).errors).toEqual([])
  })
})

describe('the message of a submit', () => {
  it('puts the text of each field where the template names it, once', () => {
    const values: Record<string, string> = { essay: '  my text  ', other: '{{essay}}' }
    expect(fillTemplate('Correct: {{essay}} and {{ other }}', (name) => values[name])).toBe('Correct: my text and {{essay}}')
  })

  it('gives nothing for a name that is no field', () => {
    expect(fillTemplate('a{{nobody}}b', () => undefined)).toBe('ab')
  })

  it('is cut at the limit, whatever the reader wrote', () => {
    expect(fillTemplate('{{essay}}', () => 'x'.repeat(FORM_LIMITS.message + 500)).length).toBe(FORM_LIMITS.message)
  })

  it('names the fields a template uses', () => {
    expect(placeholdersOf('{{a}} text {{ b_2 }} {{a}} {{9no}}')).toEqual(['a', 'b_2', 'a'])
  })
})

describe('the words of a counter', () => {
  it('counts runs of characters between blanks', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   \n ')).toBe(0)
    expect(wordCount("L'histoire a démontré\n encore  et encore")).toBe(6)
  })

  it('says where the count stands against what is asked', () => {
    expect(counterState(80, 100, 150)).toBe('under')
    expect(counterState(120, 100, 150)).toBe('inside')
    expect(counterState(200, 100, 150)).toBe('over')
    expect(counterState(5)).toBe('none')
    expect(counterState(5, undefined, 3)).toBe('over')
  })
})

describe('what a form may not do', () => {
  const problems = (src: string) => parseUi(src, { streaming: false }).errors.map((error) => error.message)

  it('is told when a template names a field that is not there, or a counter counts one', () => {
    const messages = problems(`root = Form([a, c], s)
a = TextArea("essay")
c = Counter("nobody")
s = Submit("Send", "Text: {{missing}}", ["gone"])`)
    expect(messages.some((message) => message.includes('{{missing}}'))).toBe(true)
    expect(messages.some((message) => message.includes('Counter counts "nobody"'))).toBe(true)
    expect(messages.some((message) => message.includes('requires "gone"'))).toBe(true)
  })

  it('is told when a field is named badly or twice', () => {
    const messages = problems(`root = Form([TextArea("my essay"), TextArea("a"), TextArea("a")], Submit("Send", "{{a}}"))`)
    expect(messages.some((message) => message.includes('"my essay"'))).toBe(true)
    expect(messages.some((message) => message.includes('used twice'))).toBe(true)
  })

  it('is told when a field is met outside a form, or a form inside a form', () => {
    expect(problems(`root = Stack([TextArea("lonely")])`).some((message) => message.includes('only works inside a Form'))).toBe(true)
    expect(problems(`root = Form([Form([TextArea("a")], Submit("In", "{{a}}"))], Submit("Out", "x"))`).some((message) => message.includes('cannot hold another Form'))).toBe(true)
  })

  it('refuses a form with too many fields, and a template that is too long', () => {
    const many = Array.from({ length: FORM_LIMITS.fields + 1 }, (_, i) => `TextArea("f${i}")`).join(', ')
    expect(problems(`root = Form([${many}], Submit("Send", "x"))`).some((message) => message.includes('at most'))).toBe(true)
    expect(problems(`root = Form([TextArea("a")], Submit("Send", "${'x'.repeat(FORM_LIMITS.template + 1)}"))`).some((message) => message.includes('longer than'))).toBe(true)
  })

  it('reports nothing for a node tree that holds no form', () => {
    const result = parseUi('root = Stack([Markdown("hello")])', { streaming: false })
    expect(checkForms(result.root!)).toEqual([])
  })
})
