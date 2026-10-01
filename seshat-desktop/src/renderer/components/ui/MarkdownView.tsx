import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'
import { openInAppBrowser, shouldOpenInAppBrowser } from '@renderer/lib/openInAppBrowser'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Short language tags read poorly as headers ("md", "js", "py") - a small
// display-name map for the common ones, falling back to just capitalizing
// whatever Prism's own language id is for anything not listed.
const LANGUAGE_LABELS: Record<string, string> = {
  md: 'Md', markdown: 'Md',
  js: 'JS', jsx: 'JSX', ts: 'TS', tsx: 'TSX', javascript: 'JS', typescript: 'TS',
  py: 'Python', python: 'Python',
  sh: 'Bash', bash: 'Bash', shell: 'Bash', zsh: 'Bash',
  json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
  html: 'HTML', xml: 'XML', css: 'CSS', scss: 'SCSS', less: 'LESS',
  sql: 'SQL', go: 'Go', rust: 'Rust', rs: 'Rust', java: 'Java', kotlin: 'Kotlin',
  c: 'C', cpp: 'C++', cs: 'C#', php: 'PHP', ruby: 'Ruby', rb: 'Ruby', swift: 'Swift',
  docker: 'Docker', dockerfile: 'Docker', graphql: 'GraphQL', proto: 'Protobuf'
}

function languageLabel(lang: string): string {
  return LANGUAGE_LABELS[lang.toLowerCase()] ?? (lang.charAt(0).toUpperCase() + lang.slice(1))
}

function CopyIcon() {
  return <svg width="12" height="12" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="6" width="9" height="9" rx="1.5" /><path d="M3.5 11.5V4.5a1 1 0 0 1 1-1h7" /></svg>
}

function CheckIcon() {
  return <svg width="12" height="12" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 9 3.5 3.5L14 5.5" /></svg>
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="11" height="11" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={cx('transition-transform duration-150', collapsed ? '-rotate-90' : 'rotate-0')}
    >
      <path d="m5 7 4 4 4-4" />
    </svg>
  )
}

// A fenced ```lang code block - header strip (language tag, collapse
// toggle, copy button) over Prism-highlighted content, instead of a bare
// syntax-highlighted block with no way to collapse or copy it.
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-[var(--border-soft)] bg-white/5 px-2.5 py-1.5">
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-1 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          <ChevronIcon collapsed={collapsed} />
          <span>{languageLabel(language)}</span>
        </button>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-soft)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
          onClick={copy}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {!collapsed && (
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={CODE_BLOCK_STYLE}
        >
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  )
}

const CODE_BLOCK_STYLE = {
  margin: 0,
  padding: '12px 14px',
  fontSize: '12.5px',
  lineHeight: 1.6,
  background: 'transparent',
  borderRadius: 0
}

// Renders a ```mermaid fenced block as an inline diagram. mermaid is loaded
// lazily (it's a sizeable dependency) and only once a diagram actually
// appears - most conversations never use one.
function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // mermaid.render needs an id unique per diagram on the page; useId() is
  // stable and collision-free but contains colons, which aren't valid in an
  // SVG element id.
  const rawId = useId()
  const idRef = useRef(`mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setSvg(null)

    import('mermaid').then(async ({ default: mermaid }) => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light'
      mermaid.initialize({
        startOnLoad: false,
        theme: isLight ? 'default' : 'dark',
        // Diagram source ultimately comes from model output, which may be
        // influenced by untrusted content (web search results, fetched
        // pages, etc.) included earlier in the conversation - keep mermaid's
        // own sanitization on rather than relaxing it for convenience.
        securityLevel: 'strict'
      })
      return mermaid.render(idRef.current, code)
    }).then(({ svg: rendered }) => {
      if (!cancelled) setSvg(rendered)
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render diagram')
    })

    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <div className="my-4 flex flex-col items-stretch gap-1.5 overflow-x-auto">
        <div className="text-[12px] text-[var(--accent-danger)]">Diagram failed to render: {error}</div>
        <pre className="m-0 overflow-x-auto rounded-md bg-[var(--surface-muted)] p-2.5 text-[12px]">{code}</pre>
      </div>
    )
  }
  if (!svg) {
    return <div className="my-4 flex justify-start overflow-x-auto p-4 text-[12px] text-[var(--text-muted)]">Rendering diagram…</div>
  }
  // svg is mermaid's own sanitized output (securityLevel: 'strict' above),
  // not raw user/model text - see the note on that setting.
  return <div className="my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
}

// Renders a ```chart fenced block (a JSON Chart.js config: {type, data,
// options}) as an interactive chart - JSON.parse can't execute code, so
// this is exactly as safe as mermaid's text-based diagram syntax: the model
// supplies a declarative spec, never arbitrary script. Chart.js is loaded
// lazily, same rationale as mermaid.
function ChartBlock({ code }: { code: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let chartInstance: { destroy: () => void } | null = null
    setError(null)

    let config: { type?: string; data?: unknown; options?: Record<string, unknown> }
    try {
      config = JSON.parse(code)
    } catch {
      setError('Invalid chart JSON')
      return
    }
    if (!config.type || !config.data) {
      setError('Chart config needs a "type" and "data" field')
      return
    }

    import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled || !canvasRef.current) return
      const isLight = document.documentElement.getAttribute('data-theme') === 'light'
      const tickColor = isLight ? '#44403c' : '#d6d3d1'
      const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
      // The chart type/shape only exists at runtime (parsed from the
      // model's JSON output) - Chart.js's constructor overloads need a
      // statically-known `type` to pick the right config shape, which
      // doesn't apply here by design, hence the escape hatch.
      chartInstance = new Chart(canvasRef.current, {
        type: config.type,
        data: config.data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          color: tickColor,
          plugins: { legend: { labels: { color: tickColor } } },
          scales: config.type === 'pie' || config.type === 'doughnut' ? undefined : {
            x: { ticks: { color: tickColor }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor }, grid: { color: gridColor } }
          },
          ...config.options
        }
      } as unknown as ConstructorParameters<typeof Chart>[1])
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render chart')
    })

    return () => {
      cancelled = true
      chartInstance?.destroy()
    }
  }, [code])

  if (error) {
    return (
      <div className="my-4 flex flex-col gap-1.5">
        <div className="text-[12px] text-[var(--accent-danger)]">Chart failed to render: {error}</div>
        <pre className="m-0 overflow-x-auto rounded-md bg-[var(--surface-muted)] p-2.5 text-[12px]">{code}</pre>
      </div>
    )
  }
  return (
    <div className="relative my-4 h-80">
      <canvas ref={canvasRef} />
    </div>
  )
}

type Props = {
  children: string
  className?: string
  streaming?: boolean
  sessionId?: string
}

// Close any unclosed code fences so the markdown parser never treats the
// rest of the document as a code block mid-stream.
function sealOpenFences(text: string): string {
  const lines = text.split('\n')
  let inFence = false
  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence
    }
  }
  return inFence ? `${text}\n\`\`\`` : text
}

function normalizeMathDelimiters(text: string): string {
  const segments = text.split(/(^[ \t]*(?:`{3,}|~{3,})[\s\S]*?^[ \t]*(?:`{3,}|~{3,})[ \t]*$)/gm)
  return segments.map((segment) => {
    if (/^[ \t]*(?:`{3,}|~{3,})/.test(segment)) return segment
    return segment
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$\n${math.trim()}\n$$`)
      .replace(/\\\(([^()\n]+?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
  }).join('')
}

type CodeProps = {
  inline?: boolean
  className?: string
  children?: ReactNode
}

export function MarkdownView({ children, className, streaming = false, sessionId }: Props) {
  const content = normalizeMathDelimiters(streaming ? sealOpenFences(children) : children)

  // react-markdown uses the identity of each entry here as the React element
  // type for that tag. A fresh object literal (recreated on every keystroke
  // of a streaming message) means a fresh function identity per entry, so
  // React treats every paragraph/table/code block as a brand-new component
  // type on every single token and fully unmounts+remounts it instead of
  // patching it in place - on a long streaming message with code blocks or
  // tables, that's a lot of pointless DOM teardown/rebuild, and it's a likely
  // contributor to streaming looking "chunky" independent of how paced the
  // incoming text itself is. Memoizing keeps identity stable across renders
  // (streaming/sessionId barely change), so already-rendered blocks are
  // updated in place like any other React content.
  const markdownComponents = useMemo<Components>(() => ({
          code({ inline, className, children, ...props }: CodeProps) {
            const match = /language-(\w+)/.exec(className || '')
            if (!inline && match && !streaming) {
              const code = String(children).replace(/\n$/, '')
              if (match[1] === 'mermaid') {
                return <MermaidBlock code={code} />
              }
              if (match[1] === 'chart') {
                return <ChartBlock code={code} />
              }
              return <CodeBlock language={match[1]} code={code} />
            }
            return (
              <code
                className={cx(
                  inline
                    ? 'rounded-[3px] bg-[var(--surface-muted)] px-[3px] py-0.5 font-mono text-[0.9em]'
                    : 'font-mono text-[0.9em]',
                  className
                )}
                {...props}
              >
                {children}
              </code>
            )
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0">{children}</p>
          },
          pre({ children }) {
            return <pre className="my-4 overflow-hidden rounded-md">{children}</pre>
          },
          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto">
                <table className="w-full border-collapse border border-[var(--border-soft)]">{children}</table>
              </div>
            )
          },
          th({ children }) {
            return <th className="border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2 py-1.5 text-left">{children}</th>
          },
          td({ children }) {
            return <td className="border border-[var(--border-soft)] px-2 py-1.5 text-left">{children}</td>
          },
          ul({ children }) {
            return <ul className="mb-4 list-disc pl-5">{children}</ul>
          },
          ol({ children }) {
            return <ol className="mb-4 list-decimal pl-5">{children}</ol>
          },
          li({ children }) {
            return <li className="mb-1">{children}</li>
          },
          h1({ children }) {
            return <h1 className="mb-3 mt-6 text-[1.3em] font-semibold text-[var(--text-primary)]">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="mb-3 mt-6 text-[1.15em] font-semibold text-[var(--text-primary)]">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="mb-3 mt-6 text-[1.05em] font-semibold text-[var(--text-primary)]">{children}</h3>
          },
          blockquote({ children }) {
            return <blockquote className="my-4 border-l-4 border-[var(--accent-primary)] pl-3 text-[var(--text-secondary)]">{children}</blockquote>
          },
          // Plain markdown links otherwise render as a bare <a href> with no
          // target/onClick - in Electron that's a same-frame top-level
          // navigation, replacing the whole app UI with the linked page
          // instead of opening it anywhere sensible. Route through the
          // built-in browser panel instead.
          a({ href, children, ...props }: { href?: string; children?: ReactNode }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent-primary)] underline decoration-[var(--accent-primary)]/40 underline-offset-2 hover:decoration-[var(--accent-primary)]"
                {...props}
                onClick={(event) => {
                  if (!shouldOpenInAppBrowser(event, href)) return
                  event.preventDefault()
                  if (href) openInAppBrowser(href, sessionId)
                }}
              >
                {children}
              </a>
            )
          }
        }), [streaming, sessionId])

  return (
    <div className={cx('text-[14px] leading-7 text-[var(--text-primary)]', className)}>
      <ReactMarkdown
        // KaTeX and Prism re-parse their whole input on every render; while
        // streaming, `content` changes on every token, which would mean
        // re-running both on every single chunk. Both are skipped here and
        // only applied once the message is complete (final non-streaming
        // render), trading a plain-text flash for smooth token-by-token
        // rendering during the stream itself.
        remarkPlugins={streaming ? [remarkGfm] : [remarkGfm, remarkMath]}
        rehypePlugins={streaming ? [] : [rehypeKatex]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
