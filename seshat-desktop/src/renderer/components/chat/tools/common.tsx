import { Copy } from '@icon-park/react'
import type { CSSProperties, ReactNode } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Thin, near-invisible scrollbar shared by every code/prose box here -
// visible on scroll instead of the browser's default bulky bar.
const SCROLL_THIN = '[scrollbar-width:thin] [scrollbar-color:var(--border-soft)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-app-border-subtle [&::-webkit-scrollbar-thumb]:rounded-[3px]'

const COPY_BUTTON_CSS = 'absolute right-1.5 top-1.5 flex items-center rounded-[5px] border border-app-border-subtle bg-[rgba(255,255,255,0.07)] px-[5px] py-[3px] text-app-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-[var(--surface-hover)] hover:text-app-text'

// Text pieces used inside a <HeaderCard header={…}> strip. Exported as
// class strings (not wrapper components) because every caller mixes them
// with its own tag (a <span>, an <a>, a filename vs. a match count) - a
// component would need as many props as there are callers.
export const HCARD_HEADER_PATH_CSS = 'overflow-hidden text-ellipsis text-app-text-muted'
export const HCARD_HEADER_LINK_CSS = 'min-w-0 overflow-hidden text-ellipsis text-app-text no-underline hover:text-[var(--accent-primary)] hover:underline'
export const HCARD_HEADER_STAT_CSS = 'ml-auto shrink-0 pl-2 text-[10px] font-medium text-[var(--text-muted)]'

// Shared by GlobToolView and ListDirectoryToolView - both always render
// their file list nested inside a HeaderCard, so no border/background of
// its own (that's the card's).
export const FILE_LIST_CSS = 'flex max-h-[240px] flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]'
export const FILE_ITEM_CSS = 'truncate rounded-[5px] px-2 py-[3px] font-[\'JetBrains_Mono\',\'Fira_Code\',monospace] text-[12px] text-app-text-secondary transition-colors duration-100 hover:bg-[rgba(255,255,255,0.04)]'
export const FILEPATH_CSS = 'truncate font-[\'JetBrains_Mono\',\'Fira_Code\',monospace] text-[12px] font-semibold text-app-text'

// Shared by AskUserToolView (the read-only transcript record) and
// AskUserPanel (the live, answerable card) - both render the same
// question/answer shapes, just with different interactivity around them.
export const ASK_NOTE_CSS = 'text-[11px] leading-[1.35] text-app-text-muted'
export const ASK_QUESTION_CSS = 'text-[11px] leading-[1.35] text-app-text'
export const ASK_ANSWER_VALUE_CSS = 'text-[11px] leading-[1.35] text-app-text'
export const ASK_SUMMARY_CSS = 'flex flex-col overflow-hidden rounded-b-md border border-t-0 border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_90%,var(--surface-panel))]'
export const ASK_QA_CSS = 'grid grid-cols-[34px_minmax(0,1fr)] gap-3 border-t border-app-border-subtle px-3.5 py-3 first:border-t-0'
export const ASK_QA_INDEX_CSS = 'mt-px inline-flex size-[25px] items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_9%,var(--surface-root))] text-[11px] font-bold text-app-text-secondary'
export const ASK_QA_COPY_CSS = 'flex min-w-0 flex-col gap-[7px]'
export const ASK_CARD_CSS = 'flex flex-col gap-1.5 rounded-[5px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_78%,var(--surface-panel))] px-2 py-[7px]'
// The combined result of the original `tb-ask-card tb-ask-card--pending`
// pair (the pending variant overrides padding/background, not a full
// restyle) - see ErrorPre above for the same reasoning.
export const ASK_CARD_PENDING_CSS = 'flex flex-col gap-1.5 rounded-[5px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_82%,var(--surface-panel))] px-2 py-1.5'
export const ASK_PENDING_NOTE_CSS = 'text-[11px] italic text-app-text-muted'

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="text-[9px] font-bold uppercase tracking-[0.04em] text-app-text-muted">{label}</span>
      {children}
    </div>
  )
}

// A single bordered card with a compact header strip (path, pattern, stat -
// whatever identifies *what* this call was about) directly attached to its
// body, instead of that same information floating as an unstyled line above
// a separately-bordered box. Used wherever a tool's "what" (a path, a
// pattern) and its "result" (a file list, matched lines) belong together as
// one visual unit - see GlobToolView/ListDirectoryToolView/GrepToolView/
// ReadToolView for the pattern. Body content that has its own border
// (CodeBox, a file-list) should pass `bare`/skip its own chrome so there's
// exactly one border around the whole card, never two nested ones.
export function HeaderCard({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    // `tb-hcard` carries no CSS of its own anymore - kept as a bare marker
    // class so ToolLineItem's `[&>.tb-hcard:first-child]:…` can still flatten
    // this card's top corners when it's the first thing in an expanded body.
    <div className="tb-hcard overflow-hidden rounded-md border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_72%,var(--surface-panel))]">
      <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap border-b border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-muted)_70%,var(--surface-root))] px-2.5 py-[7px] text-[12px] font-[650] text-app-text">
        {header}
      </div>
      <div>{children}</div>
    </div>
  )
}

export function CodeBox({
  content,
  variant,
  copyable,
  language,
  lineNumbers,
  startingLineNumber = 1,
  bare,
  expanded,
}: {
  content: string
  variant?: 'error'
  copyable?: boolean
  // Renders with Prism syntax highlighting instead of plain monospace text
  // - used for the bash command itself, which reads far better colored
  // than as a flat grey block.
  language?: string
  // Only meaningful alongside `language` - a plain <pre> has no per-line
  // gutter to render. Off by default: useful for a full file (ReadToolView)
  // or long log-shaped output, noisy for a one-line bash command.
  lineNumbers?: boolean
  // Lets a partial-file read (an `offset` input) show the file's real line
  // numbers instead of always starting the gutter at 1.
  startingLineNumber?: number
  // Drops this box's own border/background - for nesting inside a
  // HeaderCard, which already supplies the one border the two together
  // should have. A standalone CodeBox never sets this.
  bare?: boolean
  // Full-page inside Computer/Files (a dedicated file view, plenty of room,
  // its own scroll) rather than a compact inline chat card: no 220px soft
  // cap, the content just fills its container.
  expanded?: boolean
}) {
  const isError = variant === 'error'
  return (
    <div
      className={cx(
        'group relative overflow-hidden',
        bare && 'rounded-none border-0 bg-transparent',
        !bare && isError && 'rounded-md border border-[rgba(var(--color-error-rgb),0.18)] bg-[rgba(var(--color-error-rgb),0.06)]',
        !bare && !isError && 'rounded-md border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_84%,black)]',
      )}
    >
      {language ? (
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus as any}
          customStyle={expanded ? CODE_HIGHLIGHT_STYLE_EXPANDED : CODE_HIGHLIGHT_STYLE}
          codeTagProps={{ style: expanded ? CODE_HIGHLIGHT_CODE_STYLE_EXPANDED : CODE_HIGHLIGHT_CODE_STYLE }}
          className={SCROLL_THIN}
          showLineNumbers={lineNumbers}
          startingLineNumber={startingLineNumber}
          lineNumberStyle={LINE_NUMBER_STYLE}
        >
          {content}
        </SyntaxHighlighter>
      ) : (
        <pre className={cx('m-0 overflow-auto px-[9px] py-2 font-mono text-[11px] leading-[1.5] text-app-text-secondary', expanded ? 'max-h-none whitespace-pre' : 'max-h-[220px] whitespace-pre-wrap break-all', isError && 'text-[var(--accent-danger)]')}>
          {content}
        </pre>
      )}
      {copyable && (
        <button
          className={COPY_BUTTON_CSS}
          type="button"
          aria-label="Copy"
          onClick={() => void navigator.clipboard.writeText(content)}
        >
          <Copy size={10} />
        </button>
      )}
    </div>
  )
}

// For tools whose result is readable prose/text (a feed of articles, a
// markdown doc, a validation report) rather than code - normal line-height
// and no monospace, so it reads like text instead of looking like a code
// dump that happens to contain sentences.
export function ProseBox({ content, copyable, bare, expanded }: { content: string; copyable?: boolean; bare?: boolean; expanded?: boolean }) {
  return (
    <div
      className={cx(
        'relative',
        bare ? 'rounded-none border-0 bg-transparent' : 'rounded-lg border border-app-border-subtle bg-[rgba(0,0,0,0.2)]',
      )}
    >
      {/* Full-page inside Computer's Screen: no soft cap, there's room and
          its own scroll. Compact inline chat card: capped, same as before. */}
      <div className={cx(expanded ? 'overflow-y-auto' : 'max-h-[320px] overflow-y-auto', 'whitespace-pre-wrap break-words px-2.5 py-[9px] text-[12px] leading-[1.6] text-app-text-secondary', SCROLL_THIN)}>{content}</div>
      {/* Note: pre-existing quirk carried over from the CSS version - this
          button has no hover-reveal wired to .tb-prose (only .tb-code had
          it), so it renders permanently at opacity-0. Left unchanged here;
          worth a follow-up if ProseBox copy is meant to work. */}
      {copyable && (
        <button
          className={COPY_BUTTON_CSS}
          type="button"
          aria-label="Copy"
          onClick={() => void navigator.clipboard.writeText(content)}
        >
          <Copy size={10} />
        </button>
      )}
    </div>
  )
}

// Every renderer's error section ends with exactly this: a standalone,
// self-bordered error block for `result.content`, distinct from CodeBox's
// own `variant="error"` (which is a color tweak on an already-wrapped code
// box). One shared component instead of the same literal className string
// duplicated in 16 renderers.
export function ErrorPre({ content }: { content: string }) {
  return (
    <pre className="m-0 max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words rounded-app-md border border-[rgba(var(--color-error-rgb),0.18)] bg-[rgba(var(--color-error-rgb),0.08)] px-3 py-[10px] font-['JetBrains_Mono','Fira_Code',monospace] text-[12px] leading-normal text-[var(--accent-danger)]">
      {content}
    </pre>
  )
}

const CODE_HIGHLIGHT_STYLE: CSSProperties = {
  margin: 0,
  padding: '8px 10px',
  fontSize: '11.5px',
  lineHeight: 1.5,
  background: 'transparent',
  maxHeight: 220,
  overflowY: 'auto',
  overflowX: 'auto',
}

const CODE_HIGHLIGHT_STYLE_EXPANDED: CSSProperties = {
  ...CODE_HIGHLIGHT_STYLE,
  maxHeight: undefined,
}

// Long lines wrap instead of scrolling horizontally out of view - the
// scroll from customStyle above is a safety net for a single unbreakable
// token, not the normal case. Fine for a compact inline chat card; wrong for
// a full-page file view, where a wide line (a markdown table row, a long
// code line) forcibly wrapped into a narrow column shreds it into
// unreadable fragments instead of just scrolling sideways like a real code
// editor - CODE_HIGHLIGHT_CODE_STYLE_EXPANDED below is that case.
const CODE_HIGHLIGHT_CODE_STYLE: CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const CODE_HIGHLIGHT_CODE_STYLE_EXPANDED: CSSProperties = {
  whiteSpace: 'pre',
}

const LINE_NUMBER_STYLE: CSSProperties = {
  minWidth: '2.5em',
  paddingRight: '1em',
  textAlign: 'right',
  color: 'var(--text-muted)',
  userSelect: 'none',
}
