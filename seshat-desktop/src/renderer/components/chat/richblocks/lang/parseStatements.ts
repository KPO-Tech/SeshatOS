import type { Statement, UiError, Value } from './types'

class SyntaxProblem extends Error {}

const STATEMENT_START = /([A-Za-z_][A-Za-z0-9_]*)[ \t]*=(?!=)/y
const NEXT_STATEMENT = /\n[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=(?!=)/g
const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y
const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const PARTIAL_NUMBER = /-\.?|-?\d+\.|-?\d+(?:\.\d+)?[eE][+-]?/y

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\' }

class Reader {
  pos = 0
  /** Set when the text ended inside a string, bracket or call, and the parser closed it. */
  closedByParser = false

  constructor(readonly src: string) {}

  get done(): boolean {
    return this.pos >= this.src.length
  }

  skipSpace(): void {
    while (!this.done && /\s/.test(this.src[this.pos])) this.pos++
  }

  match(re: RegExp): string | null {
    re.lastIndex = this.pos
    const found = re.exec(this.src)
    if (!found) return null
    this.pos += found[0].length
    return found[0]
  }

  value(): Value {
    this.skipSpace()
    if (this.done) {
      this.closedByParser = true
      return { k: 'null' }
    }
    const c = this.src[this.pos]
    if (c === '"' || c === "'") return this.string(c)
    if (c === '[') return { k: 'arr', items: this.sequence('[', ']', () => this.value()) }
    if (c === '{') return { k: 'obj', entries: this.sequence('{', '}', () => this.entry()) }
    if (c === '@') return this.action()
    if (c === '-' || (c >= '0' && c <= '9')) return this.number()
    if (/[A-Za-z_]/.test(c)) return this.word()
    throw new SyntaxProblem(`unexpected "${c}"`)
  }

  private string(quote: string): Value {
    this.pos++
    let out = ''
    while (!this.done) {
      const c = this.src[this.pos++]
      if (c === quote) return { k: 'str', v: out }
      if (c !== '\\') {
        out += c
        continue
      }
      if (this.done) break
      const next = this.src[this.pos++]
      if (next === 'u') {
        const hex = this.src.slice(this.pos, this.pos + 4)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16))
          this.pos += 4
          continue
        }
      }
      out += ESCAPES[next] ?? next
    }
    this.closedByParser = true
    return { k: 'str', v: out }
  }

  private number(): Value {
    const whole = this.match(NUMBER)
    if (whole !== null) return { k: 'num', v: Number(whole) }
    if (this.match(PARTIAL_NUMBER) !== null && this.done) {
      this.closedByParser = true
      return { k: 'null' }
    }
    throw new SyntaxProblem('a number is expected')
  }

  private word(): Value {
    const name = this.match(IDENT) as string
    this.skipInlineSpace()
    if (this.src[this.pos] === '(') {
      return { k: 'call', name, args: this.sequence('(', ')', () => this.value()) }
    }
    if (name === 'true') return { k: 'bool', v: true }
    if (name === 'false') return { k: 'bool', v: false }
    if (name === 'null') return { k: 'null' }
    return { k: 'ref', name }
  }

  private action(): Value {
    this.pos++
    const name = this.match(IDENT)
    if (name === null) throw new SyntaxProblem('an action name is expected after "@"')
    this.skipInlineSpace()
    if (this.src[this.pos] !== '(') return { k: 'action', name, args: [] }
    return { k: 'action', name, args: this.sequence('(', ')', () => this.value()) }
  }

  private entry(): [string, Value] {
    this.skipSpace()
    const c = this.src[this.pos]
    let key: string
    if (c === '"' || c === "'") {
      const parsed = this.string(c)
      key = parsed.k === 'str' ? parsed.v : ''
    } else {
      const ident = this.match(IDENT)
      if (ident === null) throw new SyntaxProblem('a key is expected')
      key = ident
    }
    this.skipSpace()
    if (this.done) {
      this.closedByParser = true
      return [key, { k: 'null' }]
    }
    if (this.src[this.pos] !== ':') throw new SyntaxProblem('":" is expected after a key')
    this.pos++
    return [key, this.value()]
  }

  private sequence<T>(open: string, close: string, item: () => T): T[] {
    this.pos++
    const items: T[] = []
    for (;;) {
      this.skipSpace()
      if (this.done) {
        this.closedByParser = true
        return items
      }
      if (this.src[this.pos] === close) {
        this.pos++
        return items
      }
      items.push(item())
      this.skipSpace()
      if (this.done) {
        this.closedByParser = true
        return items
      }
      const c = this.src[this.pos]
      if (c === ',') this.pos++
      else if (c !== close) throw new SyntaxProblem(`"," or "${close}" is expected after a value in "${open}"`)
    }
  }

  private skipInlineSpace(): void {
    while (!this.done && (this.src[this.pos] === ' ' || this.src[this.pos] === '\t')) this.pos++
  }

  skipToNextStatement(from: number): void {
    NEXT_STATEMENT.lastIndex = from
    const found = NEXT_STATEMENT.exec(this.src)
    this.pos = found ? found.index + 1 : this.src.length
  }
}

export interface ParsedStatements {
  statements: Map<string, Statement>
  errors: UiError[]
}

/** Reads `name = value` lines. A text cut anywhere gives the statements read so far, the last one closed for the reader. */
export function parseStatements(src: string, streaming: boolean): ParsedStatements {
  const reader = new Reader(src)
  const statements = new Map<string, Statement>()
  const errors: UiError[] = []

  for (;;) {
    reader.skipSpace()
    if (reader.done) break
    const start = reader.pos
    const head = reader.match(STATEMENT_START)
    if (head === null) {
      const text = src.slice(start).split('\n', 1)[0].trim()
      if (!isStreamingTail(src, start, streaming)) {
        errors.push({ code: 'syntax', message: `A line is not a statement: ${clip(text)}`, hint: 'Write name = value, one statement per line.' })
      }
      reader.skipToNextStatement(start + 1)
      continue
    }
    const name = head.slice(0, head.indexOf('=')).trim()
    reader.closedByParser = false
    try {
      const value = reader.value()
      const endsAtTextEnd = reader.pos >= src.length
      const open = streaming && (reader.closedByParser || endsAtTextEnd)
      if (reader.closedByParser && !streaming) {
        errors.push({ code: 'unclosed', statement: name, message: `${name} is cut off and was closed for you.` })
      }
      if (!reader.closedByParser) rejectTrailing(reader, errors, name, streaming)
      statements.delete(name)
      statements.set(name, { name, value, open })
    } catch (problem) {
      if (!(problem instanceof SyntaxProblem)) throw problem
      const open = isStreamingTail(src, reader.pos, streaming)
      if (!open) errors.push({ code: 'syntax', statement: name, message: problem.message })
      reader.skipToNextStatement(start + 1)
    }
  }
  return { statements, errors }
}

function rejectTrailing(reader: Reader, errors: UiError[], name: string, streaming: boolean): void {
  while (!reader.done && (reader.src[reader.pos] === ' ' || reader.src[reader.pos] === '\t')) reader.pos++
  if (reader.done || reader.src[reader.pos] === '\n' || reader.src[reader.pos] === '\r') return
  const rest = reader.src.slice(reader.pos).split('\n', 1)[0]
  if (!streaming || !reader.src.slice(reader.pos).includes('\n')) {
    errors.push({ code: 'syntax', statement: name, message: `Unexpected text after the value of ${name}: ${clip(rest)}` })
  }
  const lineEnd = reader.src.indexOf('\n', reader.pos)
  reader.pos = lineEnd === -1 ? reader.src.length : lineEnd
}

function isStreamingTail(src: string, pos: number, streaming: boolean): boolean {
  return streaming && !src.slice(pos).includes('\n')
}

function clip(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text
}
