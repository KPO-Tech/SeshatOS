import {
  Terminal, Globe, FileTextOne, Robot, PlugOne,
  MindMapping, Notebook, Calculator, Comment, Calendar,
} from '@icon-park/react'
import type { ToolPromptRequest, ToolStatus, ToolUseBlock } from '@renderer/api/types'
import type { AskUserOption, AskUserQuestion, WebSearchHit } from './types'

// Splits on both / and \ - the tool calls' file_path values can be genuine
// Windows paths (backend runs on Windows too), and splitting only on '/'
// left the entire absolute path as the "basename" whenever a backslash
// path came through, defeating every "show just the filename" spot in
// this file, DiffView, and ReadToolView.
export function basename(fp: string): string {
  return fp.split(/[/\\]/).filter(Boolean).pop() ?? fp
}

// Maps a file's extension to a Prism language identifier, so file-content
// views (ReadToolView, DiffView) can syntax-highlight instead of showing
// flat monospace text.
const EXT_LANGUAGE: Record<string, string> = {
  go: 'go', ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript',
  py: 'python', rb: 'ruby', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
  sql: 'sql', yaml: 'yaml', yml: 'yaml', json: 'json', md: 'markdown',
  sh: 'bash', bash: 'bash', zsh: 'bash', html: 'markup', xml: 'markup',
  css: 'css', scss: 'scss', less: 'less', toml: 'toml', dockerfile: 'docker',
  graphql: 'graphql', proto: 'protobuf',
}

export function languageForPath(filePath: string): string | undefined {
  const base = basename(filePath)
  if (base.toLowerCase() === 'dockerfile') return 'docker'
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : ''
  return EXT_LANGUAGE[ext]
}

// A read tool's result.content is never the file's raw bytes - it's a
// "File: <path>\nLines: N-M of T\n\n" header followed by every line prefixed
// with its own cat -n style "  N→" number (see AddLineNumbers/
// FormatTextWithLineNumbers, seshat/internal/tools/files/read/utils.go -
// FormatTextWithLineNumbers is always called with compact=false, so the
// prefix is space-padded to at least 4 chars, not bare "N→"). Fine as plain
// text (an extra redundant number next to CodeBox's own gutter is only a
// minor eyesore), catastrophic as markdown: those are single '\n's, which
// markdown collapses into spaces, so the whole file renders as one run-on
// paragraph. Recovers the file's actual text - and its real starting line
// number, straight from the header - for both display paths to share.
const READ_TOOL_HEADER_RE = /^File: [^\n]*\nLines: (\d+)-\d+ of \d+(?: \(truncated\))?\n\n/
const READ_TOOL_LINE_PREFIX_RE = /^\s*\d+→/

export function parseReadToolContent(raw: string): { text: string; startLine?: number } {
  const header = READ_TOOL_HEADER_RE.exec(raw)
  if (!header) return { text: raw }
  const startLine = Number(header[1])
  const text = raw
    .slice(header[0].length)
    .split('\n')
    .map((line) => line.replace(READ_TOOL_LINE_PREFIX_RE, ''))
    .join('\n')
    // The formatter trails every content line (including the last) with its
    // own \n, which would otherwise show as one extra trailing blank line.
    .replace(/\n$/, '')
  return { text, startLine: Number.isFinite(startLine) ? startLine : undefined }
}

export function toolIcon(name: string) {
  if (name === 'bash') return <Terminal size={11} />
  if (name === 'ask_user_question') return <FileTextOne size={11} />
  if (['task_create', 'task_update', 'task_list'].includes(name)) return <FileTextOne size={11} />
  if (name === 'web_search' || name === 'web_fetch') return <Globe size={11} />
  if (name.startsWith('browser_')) return <Globe size={11} />
  if (name.startsWith('mcp__') || name === 'mcp') return <PlugOne size={11} />
  if (name === 'agent') return <Robot size={11} />
  if (name.startsWith('memory_')) return <MindMapping size={11} />
  if (name.startsWith('notebook_')) return <Notebook size={11} />
  if (['calculator', 'statistics', 'unit_convert', 'financial_calc'].includes(name)) return <Calculator size={11} />
  if (name.startsWith('hn_') || name.startsWith('devto_')) return <Comment size={11} />
  if (['schedule_job', 'list_jobs'].includes(name)) return <Calendar size={11} />
  if (['glob', 'grep', 'read', 'write', 'edit', 'file_read', 'file_write', 'file_edit'].includes(name)) {
    return <FileTextOne size={11} />
  }
  return <Terminal size={11} />
}

export function fallbackApprovalDescription(tool: ToolUseBlock): string {
  if (tool.name === 'bash') {
    const command = typeof tool.input.command === 'string' ? tool.input.command : ''
    if (command.trim()) return `This will execute a local shell command: ${command}`
  }
  return 'This tool requires explicit approval before it can run.'
}

export function statusLabel(status: ToolStatus): string {
  return {
    pending: 'Pending',
    running: 'Running',
    awaiting_approval: 'Awaiting Approval',
    completed: 'Completed',
    failed: 'Failed',
  }[status]
}

export function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function parseBashResult(result?: ToolUseBlock['_result']) {
  if (!result) return null
  const metadata = result.metadata ?? {}
  const stdout = typeof metadata.stdout === 'string' ? metadata.stdout : null
  const stderr = typeof metadata.stderr === 'string' ? metadata.stderr : null
  const exitCode = typeof metadata.exit_code === 'number' ? metadata.exit_code : null

  if (stdout !== null || stderr !== null || exitCode !== null) {
    return {
      exitCode,
      stdout,
      stderr,
    }
  }

  const content = result.content
  const exitMatch = content.match(/Exit code:\s*(\d+)/)
  const stdoutMatch = content.match(/\nOutput:\n([\s\S]*?)(?=\nErrors:|$)/)
  const stderrMatch = content.match(/\nErrors:\n([\s\S]*)$/)

  return {
    exitCode: exitMatch ? parseInt(exitMatch[1]) : null,
    stdout: stdoutMatch ? stdoutMatch[1].trimEnd() : null,
    stderr: stderrMatch ? (stderrMatch[1].trimEnd() || null) : null,
  }
}

export function parseAskUserQuestions(input: Record<string, unknown>): AskUserQuestion[] {
  const rawQuestions = input.questions
  if (!Array.isArray(rawQuestions)) return []

  const questions: AskUserQuestion[] = []

  for (const entry of rawQuestions) {
    if (!entry || typeof entry !== 'object') continue
    const question = entry as Record<string, unknown>
    if (typeof question.question !== 'string') continue

    const options: AskUserOption[] = []
    if (Array.isArray(question.options)) {
      for (const option of question.options) {
        if (!option || typeof option !== 'object') continue
        const item = option as Record<string, unknown>
        if (typeof item.label !== 'string') continue
        options.push({
          label: item.label,
          description: typeof item.description === 'string' ? item.description : undefined,
          preview: typeof item.preview === 'string' ? item.preview : undefined,
        })
      }
    }

    questions.push({
      header: typeof question.header === 'string' ? question.header : '',
      question: question.question,
      options,
      multiSelect: Boolean(question.multiSelect),
    })
  }

  return questions
}

// The question list a tool call actually presents: its own structured
// `questions` input when present, else a single question synthesized from a
// bare prompt (text/confirm/choice with no parsed question list) - the
// prompt is the only source of the question text and options in that case.
// Shared by AskUserToolView (post-answer summary) and AskUserPanel (the
// live above-input UI) so the two surfaces can never disagree about what
// the question list for a given tool call actually is.
export function resolveAskUserQuestions(
  input: Record<string, unknown>,
  prompt: ToolPromptRequest | undefined,
): AskUserQuestion[] {
  const parsedQuestions = parseAskUserQuestions(input)
  if (parsedQuestions.length > 0) return parsedQuestions
  if (!prompt || !prompt.message) return parsedQuestions

  // A bare confirm prompt (no `questions` input, no `options` - just
  // type='confirm') has no options to synthesize from; render it as a
  // two-option Yes/No question instead, marked `kind: 'confirm'` so the
  // submit side sends back the boolean the prompt actually expects, not the
  // literal label text.
  if (prompt.type === 'confirm') {
    return [{
      header: typeof prompt.metadata?.header === 'string' ? prompt.metadata.header : '',
      question: prompt.message,
      options: [{ label: 'Yes' }, { label: 'No' }],
      multiSelect: false,
      kind: 'confirm',
    }]
  }

  const header = typeof prompt.metadata?.header === 'string' ? prompt.metadata.header : ''
  const multiSelect = Boolean(prompt.metadata?.multiSelect)
  const options = (prompt.options ?? [])
    .filter((option) => String(option.value ?? option.label) !== '__other__')
    .map((option) => ({
      label: option.label,
      description: option.description,
    }))

  // A bare text prompt (type='text', no options) - free-form input only,
  // options stay empty so both renderers know to show just a textarea.
  if (prompt.type === 'text' || options.length === 0) {
    return [{ header, question: prompt.message, options: [], multiSelect: false }]
  }

  return [{ header, question: prompt.message, options, multiSelect }]
}

export function parseAskUserAnswers(content?: string): Map<string, string> {
  const answers = new Map<string, string>()
  if (!content) return answers

  const matches = content.matchAll(/Q:\s*(.+?)\nA:\s*([\s\S]*?)(?=\n(?:Preview:|Notes:|Q:)|$)/g)
  for (const match of matches) {
    const question = match[1]?.trim()
    const answer = match[2]?.trim()
    if (question && answer) {
      answers.set(question, answer)
    }
  }
  return answers
}

export function splitSelectedAnswer(answer: string): string[] {
  return answer
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseWebSearchHits(content?: string): WebSearchHit[] {
  if (!content) return []
  const lines = content.split('\n')
  const hits: WebSearchHit[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const titleMatch = lines[index]?.match(/^\d+\.\s+(.+)$/)
    const urlLine = lines[index + 1]?.trim()
    if (!titleMatch || !urlLine || !/^https?:\/\//i.test(urlLine)) continue

    const snippetLines: string[] = []
    for (let cursor = index + 2; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]?.trim()
      if (!line) break
      if (/^\d+\.\s+/.test(line)) break
      snippetLines.push(line)
    }

    hits.push({
      title: titleMatch[1].trim(),
      url: urlLine,
      snippet: snippetLines.join(' '),
    })
  }

  return hits
}
