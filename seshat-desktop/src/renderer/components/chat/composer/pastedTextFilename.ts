// Pasting a wall of text into the composer (a log, a long doc, a transcript)
// almost never means "put this in my message" - it means "here's context for
// the model to read." Past this length it attaches as a .txt file instead of
// filling the textarea, matching Claude.ai/ChatGPT. Short pastes (a
// paragraph, a code snippet) still insert normally.
export const PASTE_AS_FILE_THRESHOLD = 2000

export function nextPastedTextFilename(existing: { filename: string }[]): string {
  const base = 'Pasted text'
  const used = new Set(existing.map((file) => file.filename))
  if (!used.has(`${base}.txt`)) return `${base}.txt`
  let n = 2
  while (used.has(`${base} ${n}.txt`)) n++
  return `${base} ${n}.txt`
}

const PASTED_TEXT_FILENAME_RE = /^Pasted text( \d+)?\.txt$/

// A Read of one of these is the agent re-reading context the user already
// sees as the attachment chip on their own message - not a real project
// file, so it doesn't belong in the Files panel (see SilentToolView/
// ToolLineItem's own click handlers, the only callers of this).
export function isPastedTextFilename(filename: string): boolean {
  return PASTED_TEXT_FILENAME_RE.test(filename)
}
