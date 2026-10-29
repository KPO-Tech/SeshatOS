// A small, safe reader of the formulas a model writes for a plot: x^3 - 3x + 1, sin(2x)/x, e^(-x^2), sqrt(abs(x)).
// It never calls eval: the text becomes a tree of known operations, so a formula can do nothing but compute a number.

export class ExpressionError extends Error {}

type Token =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | '(' | ')' | ',' }

type Node =
  | { k: 'num'; v: number }
  | { k: 'x' }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] }

const SUPERSCRIPTS: Record<string, string> = { '²': '^2', '³': '^3', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9', '⁻¹': '^(-1)' }

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 }

const FUNCTIONS: Record<string, { arity: number; fn: (...v: number[]) => number }> = {
  sin: { arity: 1, fn: Math.sin }, cos: { arity: 1, fn: Math.cos }, tan: { arity: 1, fn: Math.tan },
  asin: { arity: 1, fn: Math.asin }, acos: { arity: 1, fn: Math.acos }, atan: { arity: 1, fn: Math.atan },
  sinh: { arity: 1, fn: Math.sinh }, cosh: { arity: 1, fn: Math.cosh }, tanh: { arity: 1, fn: Math.tanh },
  sec: { arity: 1, fn: (v) => 1 / Math.cos(v) }, csc: { arity: 1, fn: (v) => 1 / Math.sin(v) }, cot: { arity: 1, fn: (v) => 1 / Math.tan(v) },
  exp: { arity: 1, fn: Math.exp }, ln: { arity: 1, fn: Math.log }, log: { arity: 1, fn: Math.log10 },
  log10: { arity: 1, fn: Math.log10 }, log2: { arity: 1, fn: Math.log2 },
  sqrt: { arity: 1, fn: Math.sqrt }, cbrt: { arity: 1, fn: Math.cbrt }, abs: { arity: 1, fn: Math.abs },
  sign: { arity: 1, fn: Math.sign }, floor: { arity: 1, fn: Math.floor }, ceil: { arity: 1, fn: Math.ceil }, round: { arity: 1, fn: Math.round },
  min: { arity: 2, fn: Math.min }, max: { arity: 2, fn: Math.max }, pow: { arity: 2, fn: Math.pow }, atan2: { arity: 2, fn: Math.atan2 }
}

function normalise(source: string): string {
  let text = source.trim()
  for (const [mark, power] of Object.entries(SUPERSCRIPTS)) text = text.split(mark).join(power)
  return text
    .replace(/\*\*/g, '^')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([a-zA-Z0-9.]+)/g, 'sqrt($1)')
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (/\s/.test(c)) {
      i++
    } else if (/[0-9.]/.test(c)) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i))
      if (!match) throw new ExpressionError(`Unreadable number near "${text.slice(i, i + 6)}"`)
      // "2e" before a name is 2 times e, not the start of an exponent: the regex only takes e when digits follow.
      tokens.push({ t: 'num', v: Number(match[0]) })
      i += match[0].length
    } else if (/[a-zA-Z_]/.test(c)) {
      const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(text.slice(i)) as RegExpExecArray
      tokens.push({ t: 'name', v: match[0].toLowerCase() })
      i += match[0].length
    } else if ('+-*/^(),'.includes(c)) {
      tokens.push({ t: 'op', v: c as Token extends { t: 'op'; v: infer V } ? V : never })
      i++
    } else {
      throw new ExpressionError(`Unexpected "${c}"`)
    }
  }
  return tokens
}

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.sum()
    if (this.pos < this.tokens.length) throw new ExpressionError('Unexpected text after the formula')
    return node
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private isOp(value: string): boolean {
    const token = this.peek()
    return token?.t === 'op' && token.v === value
  }

  private sum(): Node {
    let left = this.product()
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.tokens[this.pos++] as { v: '+' | '-' }).v
      left = { k: 'bin', op, a: left, b: this.product() }
    }
    return left
  }

  private startsOperand(): boolean {
    const token = this.peek()
    return token !== undefined && (token.t === 'num' || token.t === 'name' || (token.t === 'op' && token.v === '('))
  }

  // Multiplication, written or implied: 2x, 3(x+1), x(x-1), (x+1)(x-1).
  private product(): Node {
    let left = this.unary()
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = (this.tokens[this.pos++] as { v: '*' | '/' }).v
        left = { k: 'bin', op, a: left, b: this.unary() }
      } else if (this.startsOperand()) {
        left = { k: 'bin', op: '*', a: left, b: this.unary() }
      } else {
        return left
      }
    }
  }

  // A minus binds looser than a power: -x^2 is -(x^2).
  private unary(): Node {
    if (this.isOp('-')) {
      this.pos++
      return { k: 'neg', a: this.unary() }
    }
    if (this.isOp('+')) {
      this.pos++
      return this.unary()
    }
    return this.power()
  }

  private power(): Node {
    const base = this.atom()
    if (this.isOp('^')) {
      this.pos++
      return { k: 'bin', op: '^', a: base, b: this.unary() }
    }
    return base
  }

  private atom(): Node {
    const token = this.tokens[this.pos++]
    if (!token) throw new ExpressionError('The formula ends too early')
    if (token.t === 'num') return { k: 'num', v: token.v }
    if (token.t === 'op' && token.v === '(') {
      const inner = this.sum()
      if (!this.isOp(')')) throw new ExpressionError('A parenthesis is not closed')
      this.pos++
      return inner
    }
    if (token.t === 'name') return this.name(token.v)
    throw new ExpressionError(`Unexpected "${token.v}"`)
  }

  private name(name: string): Node {
    if (name === 'x') return { k: 'x' }
    if (name in FUNCTIONS && this.isOp('(')) {
      this.pos++
      const args: Node[] = [this.sum()]
      while (this.isOp(',')) {
        this.pos++
        args.push(this.sum())
      }
      if (!this.isOp(')')) throw new ExpressionError('A parenthesis is not closed')
      this.pos++
      if (args.length !== FUNCTIONS[name].arity) throw new ExpressionError(`${name} takes ${FUNCTIONS[name].arity} value${FUNCTIONS[name].arity === 1 ? '' : 's'}`)
      return { k: 'call', fn: name, args }
    }
    if (name in CONSTANTS) return { k: 'num', v: CONSTANTS[name] }
    if (name in FUNCTIONS) throw new ExpressionError(`${name} needs its value in parentheses`)
    throw new ExpressionError(`Unknown name "${name}"`)
  }
}

function evaluate(node: Node, x: number): number {
  switch (node.k) {
    case 'num': return node.v
    case 'x': return x
    case 'neg': return -evaluate(node.a, x)
    case 'bin': {
      const a = evaluate(node.a, x)
      const b = evaluate(node.b, x)
      switch (node.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return a / b
        case '^': return Math.pow(a, b)
      }
      return NaN
    }
    case 'call': return FUNCTIONS[node.fn].fn(...node.args.map((arg) => evaluate(arg, x)))
  }
}

export type Formula = (x: number) => number

/** Turns the text of a formula in x into a function. It throws an ExpressionError that says what could not be read. */
export function parseExpression(source: string): Formula {
  if (source.trim() === '') throw new ExpressionError('The formula is empty')
  const tree = new Parser(tokenize(normalise(source))).parse()
  return (x) => evaluate(tree, x)
}

/** The same, for a caller that would rather have the message than an exception. */
export function tryParseExpression(source: string): { formula: Formula; error?: undefined } | { formula?: undefined; error: string } {
  try {
    return { formula: parseExpression(source) }
  } catch (error) {
    return { error: error instanceof ExpressionError ? error.message : 'The formula cannot be read' }
  }
}
