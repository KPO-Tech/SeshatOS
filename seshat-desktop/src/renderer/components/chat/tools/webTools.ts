// The tools that read the web. Their result is a list of pages or the text of one, so it opens inline under the row in the
// chat instead of in the session panel.
const WEB_TOOLS = new Set(['web_search', 'web_fetch', 'read_url', 'read_document_url'])

export function isWebTool(name: string): boolean {
  return WEB_TOOLS.has(name)
}
