import type { ChatSession } from '@renderer/stores/session'

// Text-only transcript: walks each message's text-type content blocks. Tool
// calls aren't rendered in this first cut — a readable back-and-forth
// transcript is the reasonable default for both Export (file) and Share
// (clipboard), which both call this.
export function serializeConversationMarkdown(session: ChatSession): string {
  const lines: string[] = [`# ${session.title || 'Conversation'}`, '']

  for (const message of session.messages) {
    const text = message.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n')
      .trim()

    if (!text) continue

    const heading = message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Assistant' : message.role
    lines.push(`## ${heading}`, '', text, '')
  }

  return lines.join('\n')
}

export function conversationFileName(session: ChatSession): string {
  const slug = (session.title || 'conversation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'conversation'
  return `${slug}.md`
}
