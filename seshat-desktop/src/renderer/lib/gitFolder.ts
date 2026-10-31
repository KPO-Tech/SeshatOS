/** The folder whose git state the app shows: the project the person picked, else the session's own folder. */
export function gitFolder(session: { projectPath?: string; workspacePath?: string } | undefined | null): string | undefined {
  return session?.projectPath || session?.workspacePath || undefined
}
