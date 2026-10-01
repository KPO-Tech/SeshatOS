// Identifies "this exact command" for the purposes of remembering a user's
// approval decision across future prompts in the same install — bash is
// matched on the literal command string (that's what a user means by "this
// command"), file tools on the target path, everything else falls back to
// the full input shape so at least identical calls are recognized.
export function permissionSignature(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'bash' && typeof input.command === 'string') {
    return `bash::${input.command.trim()}`
  }
  const filePath = input.file_path
  if (typeof filePath === 'string' && filePath) {
    return `${toolName}::${filePath}`
  }
  try {
    return `${toolName}::${JSON.stringify(input)}`
  } catch {
    return toolName
  }
}
