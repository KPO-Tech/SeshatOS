// The Prism colours of code blocks, as CSS variables: the theme sets --code-* (see themes.ts), so switching the theme
// recolours every block at once with no re-render. Replaces the fixed vscDarkPlus style, which was unreadable on a
// light theme.

const v = (name: string) => `var(--code-${name})`

const base = { color: v('fg'), background: 'none', textShadow: 'none', fontFamily: 'inherit' }

export const codeTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': base,
  'pre[class*="language-"]': { ...base, background: 'transparent' },
  comment: { color: v('comment'), fontStyle: 'italic' },
  prolog: { color: v('comment') },
  doctype: { color: v('comment') },
  cdata: { color: v('comment') },
  punctuation: { color: v('punctuation') },
  operator: { color: v('punctuation') },
  namespace: { color: v('type') },
  property: { color: v('variable') },
  'attr-name': { color: v('variable') },
  variable: { color: v('variable') },
  tag: { color: v('tag') },
  selector: { color: v('tag') },
  boolean: { color: v('keyword') },
  keyword: { color: v('keyword') },
  atrule: { color: v('keyword') },
  important: { color: v('keyword'), fontWeight: 'bold' },
  number: { color: v('number') },
  constant: { color: v('number') },
  symbol: { color: v('number') },
  inserted: { color: v('number') },
  string: { color: v('string') },
  char: { color: v('string') },
  'attr-value': { color: v('string') },
  url: { color: v('string'), textDecoration: 'underline' },
  regex: { color: v('string') },
  deleted: { color: v('string') },
  function: { color: v('function') },
  builtin: { color: v('function') },
  'class-name': { color: v('type') },
  entity: { color: v('type'), cursor: 'help' },
  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' }
}
