// What the session overview shows, as plain data. Each card appears only when it has something to say: a connectors card
// with nothing connected, or an outputs card with no file, is not drawn at all.

export type ContextUsage = {
  used: number
  /** The model's context window, when known. */
  window: number | null
  /** 0 to 100, or null without a window. */
  percent: number | null
  /** Where on the bar (0 to 100) the conversation is compacted by itself, when the runtime said so. */
  compactAtPercent: number | null
}

/** The size of the context as the runtime reported it during a turn. */
type LiveContextFigure = {
  used: number
  window: number
  autoCompactAt: number
  /** How much text had streamed in the turn when the runtime reported this figure, so what follows can be estimated. */
  atChars?: number
}

/** The runtime sizes text at four bytes a token (bytesPerToken in its engine); the estimate between two reports uses the same ratio. */
const CHARS_PER_TOKEN = 4

type StreamedBlock = { type: string; text?: string; thinking?: string; _partialInput?: string }

/**
 * Characters the model has produced so far in the turn that count toward the context: its text and the arguments of the tool calls
 * it is writing. Its reasoning is left out: measured against the figures the runtime reports, reasoning does not add to the context
 * (counting it overshot by several times, then fell back at the next report).
 */
export function streamedChars(blocks: ReadonlyArray<StreamedBlock> | undefined): number {
  let total = 0
  for (const block of blocks ?? []) total += (block.text?.length ?? 0) + (block._partialInput?.length ?? 0)
  return total
}

/**
 * Tokens the model has written since the runtime last reported the size of the context. The runtime reports at the start and the
 * end of each model call, so during a long answer its figure stands still; this keeps the gauge moving until the next report.
 */
export function tokensSinceReport(charsNow: number, live: LiveContextFigure | null | undefined): number {
  if (!live) return 0
  return Math.max(0, Math.ceil((charsNow - (live.atChars ?? 0)) / CHARS_PER_TOKEN))
}

/**
 * Tokens in the conversation after the last turn: what the model was sent (the whole context) plus what it answered,
 * which is part of the next request. Null when nothing has been counted yet.
 */
export function contextUsage(
  inputTokens: number,
  outputTokens: number,
  windowTokens: number | null | undefined,
  live?: LiveContextFigure | null,
  /** Tokens written since the runtime last reported (see tokensSinceReport). */
  pendingTokens = 0,
): ContextUsage | null {
  // The runtime's own figure, reported during the turn, is fresher than the totals of the last completed turn, and its
  // window is the one the compaction thresholds are computed from.
  if (live && live.window > 0 && live.used > 0) {
    const used = live.used + Math.max(0, pendingTokens)
    return {
      used,
      window: live.window,
      percent: Math.min(100, Math.round((used / live.window) * 100)),
      compactAtPercent: live.autoCompactAt > 0 ? Math.min(100, Math.round((live.autoCompactAt / live.window) * 100)) : null,
    }
  }
  const used = Math.max(0, inputTokens) + Math.max(0, outputTokens)
  if (used === 0) return null
  const window = windowTokens && windowTokens > 0 ? windowTokens : null
  return { used, window, percent: window ? Math.min(100, Math.round((used / window) * 100)) : null, compactAtPercent: null }
}

/** 530700 gives "530.7k", 1000000 gives "1M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

type EnvironmentRow = { label: string; value: string; tone?: 'warn' }

/** The rows of the environment card: where commands run, the folder they run in, and whether anything confines them. */
export function environmentRows(input: {
  docker: boolean
  workspacePath?: string
  confinement?: { label: string; confined: boolean } | null
}): EnvironmentRow[] {
  const rows: EnvironmentRow[] = []
  if (input.docker || input.workspacePath || input.confinement) {
    rows.push({ label: 'Runs on', value: input.docker ? 'A Docker container' : 'This computer' })
  }
  if (input.workspacePath) rows.push({ label: 'Folder', value: input.workspacePath })
  if (input.confinement) {
    rows.push({ label: 'Commands', value: input.confinement.label, ...(input.confinement.confined ? {} : { tone: 'warn' as const }) })
  }
  return rows
}

type ConnectorRow = { id: string; name: string; kind: string }

/** The enabled connectors, by name, with the first `limit` shown and the rest counted. */
export function connectorRows(servers: ReadonlyArray<{ id: string; name: string; display_name?: string; server_type?: string; enabled: boolean }>, limit = 4) {
  const active = servers.filter((server) => server.enabled)
  return {
    shown: active.slice(0, limit).map((server): ConnectorRow => ({ id: server.id, name: server.display_name || server.name, kind: server.server_type ?? '' })),
    hidden: Math.max(0, active.length - limit),
    total: active.length
  }
}

export type CompactionOutcome = { pre_tokens: number; post_tokens: number }

/** What to tell the user after a compaction they asked for: how far the conversation shrank. */
export function compactionNote(outcome: CompactionOutcome): string {
  return `Compacted: ${formatTokens(outcome.pre_tokens)} to ${formatTokens(outcome.post_tokens)} tokens.`
}

/**
 * The context figure after a compaction on demand. The runtime reports its figures during a turn, and a compaction on
 * demand happens between turns, so the new size comes from the result. The window and the automatic mark are those of
 * the figure before, or the window the model is known to have; without a window there is nothing to draw.
 */
export function liveContextAfterCompaction(
  outcome: CompactionOutcome,
  before: LiveContextFigure | null | undefined,
  windowTokens: number | null | undefined,
): LiveContextFigure | null {
  const window = before?.window && before.window > 0 ? before.window : windowTokens && windowTokens > 0 ? windowTokens : 0
  if (window <= 0 || outcome.post_tokens <= 0) return null
  return { used: outcome.post_tokens, window, autoCompactAt: before?.autoCompactAt ?? 0 }
}
