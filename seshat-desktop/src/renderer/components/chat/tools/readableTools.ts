/** Tools whose result is text to read, not a process to watch: their panel opens as wide as a document's. */
export function opensWide(toolName: string): boolean {
  return toolName === 'knowledge_search' || toolName === 'knowledge_read'
}
