import { useEffect, useId, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Copy, Check, Down } from '@icon-park/react'
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
  docker: 'Docker', dockerfile: 'Docker', graphql: 'GraphQL', proto: 'Protobuf',
}

function languageLabel(lang: string): string {
  return LANGUAGE_LABELS[lang.toLowerCase()] ?? (lang.charAt(0).toUpperCase() + lang.slice(1))
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
    <div className="my-4 overflow-hidden rounded-lg border border-app-border-subtle bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-app-border-subtle bg-white/5 px-2.5 py-1.5">
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-1 py-0.5 text-xs font-semibold text-app-text-muted hover:text-app-text-secondary"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          <span className={cx('inline-flex items-center transition-transform duration-150', collapsed ? '-rotate-90' : 'rotate-0')}>
            <Down size={11} />
          </span>
          <span>{languageLabel(language)}</span>
        </button>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-[5px] rounded-md border border-app-border-subtle bg-transparent px-[9px] py-1 text-[11px] text-app-text-muted transition-[background,border-color,color] duration-100 hover:border-app-border hover:bg-[var(--color-hover)] hover:text-app-text"
          onClick={copy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {!collapsed && (
        <SyntaxHighlighter
          style={vscDarkPlus as any}
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
  borderRadius: 0,
}

// Renders a ```mermaid fenced block as an inline diagram. mermaid is loaded
// lazily (it's a sizeable dependency) and only once a diagram actually
// appears — most conversations never use one.
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
        // pages, etc.) included earlier in the conversation — keep mermaid's
        // own sanitization on rather than relaxing it for convenience.
        securityLevel: 'strict',
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
        <div className="text-xs text-app-error">Diagram failed to render: {error}</div>
        <pre className="m-0 overflow-x-auto rounded-md bg-app-surface p-2.5 text-xs">{code}</pre>
      </div>
    )
  }
  if (!svg) {
    return <div className="my-4 flex justify-start overflow-x-auto p-4 text-xs text-app-text-muted">Rendering diagram…</div>
  }
  // svg is mermaid's own sanitized output (securityLevel: 'strict' above),
  // not raw user/model text — see the note on that setting.
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
            y: { ticks: { color: tickColor }, grid: { color: gridColor } },
          },
          ...config.options,
        },
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
        <div className="text-xs text-app-error">Chart failed to render: {error}</div>
        <pre className="m-0 overflow-x-auto rounded-md bg-app-surface p-2.5 text-xs">{code}</pre>
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
  return inFence ? text + '\n```' : text
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

export function MarkdownView({ children, className, streaming = false, sessionId }: Props) {
  const content = normalizeMathDelimiters(streaming ? sealOpenFences(children) : children)

  return (
    <div className={cx('text-[13px] leading-[1.6] text-app-text', className)}>
      <ReactMarkdown
        // KaTeX and Prism re-parse their whole input on every render; while
        // streaming, `content` changes on every token, which would mean
        // re-running both on every single chunk. Both are skipped here and
        // only applied once the message is complete (final non-streaming
        // render), trading a plain-text flash for smooth token-by-token
        // rendering during the stream itself.
        remarkPlugins={streaming ? [remarkGfm] : [remarkGfm, remarkMath]}
        rehypePlugins={streaming ? [] : [rehypeKatex]}
        components={{
          code({ inline, className, children, ...props }: any) {
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
                    ? 'rounded-[3px] bg-app-surface px-[3px] py-0.5 font-mono text-[0.9em]'
                    : 'font-mono text-[0.9em]',
                  className,
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
                <table className="w-full border-collapse border border-app-border">{children}</table>
              </div>
            )
          },
          th({ children }) {
            return <th className="border border-app-border bg-app-surface px-2 py-1.5 text-left">{children}</th>
          },
          td({ children }) {
            return <td className="border border-app-border px-2 py-1.5 text-left">{children}</td>
          },
          ul({ children }) {
            return <ul className="mb-4 pl-3.5">{children}</ul>
          },
          ol({ children }) {
            return <ol className="mb-4 pl-3.5">{children}</ol>
          },
          li({ children }) {
            return <li className="mb-1">{children}</li>
          },
          h1({ children }) {
            return <h1 className="mb-3 mt-6 font-semibold text-app-text">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="mb-3 mt-6 font-semibold text-app-text">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="mb-3 mt-6 font-semibold text-app-text">{children}</h3>
          },
          blockquote({ children }) {
            return <blockquote className="my-4 border-l-4 border-app-primary pl-[11px] text-app-text-secondary">{children}</blockquote>
          },
          // Plain markdown links otherwise render as a bare <a href> with no
          // target/onClick - in Electron that's a same-frame top-level
          // navigation, replacing the whole app UI with the linked page
          // instead of opening it anywhere sensible. Route through the
          // built-in browser panel instead, same as tool-result citation
          // links (WebSearchToolView.tsx).
          a({ href, children, ...props }: any) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                {...props}
                onClick={(event) => {
                  if (!shouldOpenInAppBrowser(event, href)) return
                  event.preventDefault()
                  openInAppBrowser(href, sessionId)
                }}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
