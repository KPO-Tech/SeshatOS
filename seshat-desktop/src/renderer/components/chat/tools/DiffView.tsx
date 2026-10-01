import { Copy } from '@icon-park/react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ToolUseBlock } from '@renderer/api/types'
import { languageForPath } from './helpers'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const SCROLL_THIN = '[scrollbar-width:thin] [scrollbar-color:var(--color-border-subtle)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-app-border-subtle [&::-webkit-scrollbar-thumb]:rounded'

// ─── Backend payload shapes ─────────────────────────────────────────────────
// Mirrors github.com/KPO-Tech/seshat's edit_file/write_file tool output
// (internal/tools/files/edit/edit.go, .../write/write.go) — note the mixed
// casing is intentional and matches the Go JSON tags exactly: the outer
// metadata map uses snake_case keys, but StructuredPatchHunk is a typed
// struct with its own camelCase tags.
type StructuredPatchHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

type GitDiffMeta = {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch: string
}

export type DiffRow = {
  type: 'context' | 'add' | 'del'
  oldLineNo: number | null
  newLineNo: number | null
  text: string
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isStructuredPatchHunk(value: unknown): value is StructuredPatchHunk {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.oldStart === 'number' && typeof v.newStart === 'number' && Array.isArray(v.lines)
}

// ─── Parsers (all pure) ──────────────────────────────────────────────────────

function rowsFromHunkLines(lines: string[], oldStart: number, newStart: number): DiffRow[] {
  let oldNo = oldStart
  let newNo = newStart
  const rows: DiffRow[] = []
  for (const raw of lines) {
    const marker = raw.charAt(0)
    const text = raw.slice(1)
    if (marker === '-') {
      rows.push({ type: 'del', oldLineNo: oldNo, newLineNo: null, text })
      oldNo++
    } else if (marker === '+') {
      rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo, text })
      newNo++
    } else {
      rows.push({ type: 'context', oldLineNo: oldNo, newLineNo: newNo, text })
      oldNo++
      newNo++
    }
  }
  return rows
}

function parseStructuredPatch(hunks: StructuredPatchHunk[]): DiffRow[] {
  const rows: DiffRow[] = []
  for (const hunk of hunks) {
    rows.push(...rowsFromHunkLines(hunk.lines, hunk.oldStart, hunk.newStart))
  }
  return rows
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function parseUnifiedDiffText(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldNo = 0
  let newNo = 0
  for (const line of patch.split('\n')) {
    const header = HUNK_HEADER_RE.exec(line)
    if (header) {
      oldNo = parseInt(header[1], 10)
      newNo = parseInt(header[3], 10)
      continue
    }
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) continue
    if (oldNo === 0 && newNo === 0) continue // before the first hunk header
    const marker = line.charAt(0)
    const text = line.slice(1)
    if (marker === '-') {
      rows.push({ type: 'del', oldLineNo: oldNo, newLineNo: null, text })
      oldNo++
    } else if (marker === '+') {
      rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo, text })
      newNo++
    } else {
      rows.push({ type: 'context', oldLineNo: oldNo, newLineNo: newNo, text })
      oldNo++
      newNo++
    }
  }
  return rows
}

// Minimal LCS-based line diff — fallback only, for the brief window before
// tool result metadata has landed (or an older backend without
// structured_patch). Not used on the primary path.
function computeLcsDiff(oldStr: string, newStr: string): DiffRow[] {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const n = oldLines.length
  const m = newLines.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  let oldNo = 1
  let newNo = 1
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      rows.push({ type: 'context', oldLineNo: oldNo++, newLineNo: newNo++, text: oldLines[i] })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', oldLineNo: oldNo++, newLineNo: null, text: oldLines[i] })
      i++
    } else {
      rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo++, text: newLines[j] })
      j++
    }
  }
  while (i < n) { rows.push({ type: 'del', oldLineNo: oldNo++, newLineNo: null, text: oldLines[i] }); i++ }
  while (j < m) { rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo++, text: newLines[j] }); j++ }
  return rows
}

export type ResolvedDiff = { rows: DiffRow[]; addCount: number; delCount: number }

export function resolveDiffRows(tool: ToolUseBlock): ResolvedDiff | null {
  const metadata = tool._result?.metadata

  const structuredPatchRaw = asArray(metadata?.structured_patch).filter(isStructuredPatchHunk)
  if (structuredPatchRaw.length > 0) {
    const rows = parseStructuredPatch(structuredPatchRaw)
    return summarize(rows)
  }

  const gitDiff = metadata?.git_diff as GitDiffMeta | undefined
  if (gitDiff?.patch) {
    const rows = parseUnifiedDiffText(gitDiff.patch)
    if (rows.length > 0) return summarize(rows)
  }

  // A landed, failed result has no structured_patch/git_diff (the tool never
  // got far enough to produce one) - falling through to the input-based
  // fallback below would render the model's *proposed* content as if it were
  // a successful diff, with nothing but the small status icon to say
  // otherwise. Bail out here so the caller shows the real error instead.
  if (tool._result?.isError) return null

  // Fallback: compute client-side from raw input/original content. Covers
  // the brief window before tool._result has landed, and edit_file's
  // old_string/new_string (always present on the input itself).
  const oldStr = typeof tool.input.old_string === 'string'
    ? tool.input.old_string
    : (typeof metadata?.original_file === 'string' ? (metadata.original_file as string) : '')
  const newStr = typeof tool.input.new_string === 'string'
    ? tool.input.new_string
    : (typeof tool.input.content === 'string' ? (tool.input.content as string) : '')
  if (!oldStr && !newStr) return null
  return summarize(computeLcsDiff(oldStr, newStr))
}

function summarize(rows: DiffRow[]): ResolvedDiff {
  let addCount = 0
  let delCount = 0
  for (const row of rows) {
    if (row.type === 'add') addCount++
    else if (row.type === 'del') delCount++
  }
  return { rows, addCount, delCount }
}

// ─── Component ────────────────────────────────────────────────────────────

export function DiffView({
  filePath,
  rows,
  addCount,
  delCount,
  expanded,
}: {
  filePath?: string
  rows: DiffRow[]
  addCount: number
  delCount: number
  // Full-page inside Computer/Files: the host already shows the filename in
  // its own header, so this drops its own filename row (keeps the +/- stat,
  // the one thing that row said the host doesn't already) and its 360px cap.
  expanded?: boolean
}) {
  const language = filePath ? languageForPath(filePath) : undefined
  const showFilenameRow = Boolean(filePath) && !expanded

  const copyText = rows
    .map((r) => `${r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' '} ${r.text}`)
    .join('\n')

  return (
    <div className="flex flex-col">
      {showFilenameRow && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg border border-b-0 border-app-border-subtle bg-[rgba(255,255,255,0.03)] px-[9px] py-1.5">
          <span className="min-w-0 flex-1 truncate font-['JetBrains_Mono','Fira_Code',monospace] text-[11px] text-app-text-muted" title={filePath}>{filePath}</span>
          <span className="flex items-center gap-1.5 font-['JetBrains_Mono','Fira_Code',monospace] text-[10px] font-bold">
            <span className="text-[var(--color-success)]">+{addCount}</span>
            <span className="text-[var(--color-error)]">−{delCount}</span>
          </span>
        </div>
      )}
      {expanded && (
        <div className="flex items-center justify-end gap-1.5 pb-1.5 font-['JetBrains_Mono','Fira_Code',monospace] text-[10px] font-bold">
          <span className="text-[var(--color-success)]">+{addCount}</span>
          <span className="text-[var(--color-error)]">−{delCount}</span>
        </div>
      )}
      <div
        className={cx(
          'group relative overflow-auto font-[\'JetBrains_Mono\',\'Fira_Code\',monospace] text-[11.5px] leading-[1.55]',
          expanded ? 'rounded-none border-0 bg-transparent' : 'rounded-lg border border-app-border-subtle bg-[rgba(0,0,0,0.2)] max-h-[360px]',
          showFilenameRow && 'rounded-t-none border-t-0',
          SCROLL_THIN,
        )}
      >
        <button
          className="absolute right-1.5 top-1.5 z-[2] flex size-[26px] items-center justify-center rounded-md border border-app-border-subtle bg-[rgba(0,0,0,0.4)] text-app-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-app-text"
          type="button"
          aria-label="Copy diff"
          onClick={() => void navigator.clipboard.writeText(copyText)}
        >
          <Copy size={10} />
        </button>
        {rows.map((row, i) => (
          <div
            key={i}
            className={cx(
              'flex items-start py-0 pr-[7px]',
              row.type === 'del' && 'bg-[rgba(var(--color-error-rgb),0.10)]',
              row.type === 'add' && 'bg-[rgba(var(--color-success-rgb),0.08)]',
            )}
          >
            <span className="w-[34px] shrink-0 select-none pr-1 text-right text-[var(--color-text-disabled)]">{row.oldLineNo ?? ''}</span>
            <span className="w-[34px] shrink-0 select-none pr-1 text-right text-[var(--color-text-disabled)]">{row.newLineNo ?? ''}</span>
            <span className="w-3.5 shrink-0 select-none text-center font-bold" aria-hidden>
              {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}
            </span>
            <span className={cx('min-w-0 flex-1 pl-[3px] text-app-text-secondary', expanded ? 'whitespace-pre' : 'whitespace-pre-wrap break-all')}>
              {language ? (
                <SyntaxHighlighter
                  language={language}
                  style={vscDarkPlus}
                  PreTag="span"
                  CodeTag="span"
                  customStyle={{ background: 'transparent', padding: 0, margin: 0, display: 'inline' }}
                  codeTagProps={{ style: { background: 'transparent', fontFamily: 'inherit', fontSize: 'inherit', whiteSpace: 'pre' } }}
                >
                  {row.text || ' '}
                </SyntaxHighlighter>
              ) : (
                row.text || ' '
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
