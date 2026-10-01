// Identifies "this exact call" for the purposes of remembering a user's
// approval decision for the rest of this run — bash is matched on the
// literal command string (that's what a user means by "this command"),
// edit_file/write_file on the target path AND the proposed change (never
// the path alone: approving one edit to a file must not silently approve a
// later, different edit to the same file), everything else falls back to
// the full input shape so at least identical calls are recognized.
export function permissionSignature(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'bash' && typeof input.command === 'string') {
    return `bash::${input.command.trim()}`
  }
  const filePath = input.file_path
  if (typeof filePath === 'string' && filePath) {
    if (toolName === 'edit_file') {
      return `${toolName}::${filePath}::${String(input.old_string ?? '')}::${String(input.new_string ?? '')}`
    }
    if (toolName === 'write_file') {
      return `${toolName}::${filePath}::${String(input.content ?? '')}`
    }
    return `${toolName}::${filePath}`
  }
  try {
    return `${toolName}::${JSON.stringify(input)}`
  } catch {
    return toolName
  }
}
