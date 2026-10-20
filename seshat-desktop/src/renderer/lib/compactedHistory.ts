import type { Message } from '@renderer/api/types'

// When a conversation grows past what the model can read, the runtime compacts it: the oldest messages are replaced,
// in what the model sees, by a summary. They are not deleted: the server returns them as `archived_messages`. The
// conversation shows them above a divider, dimmed, so the user keeps the whole thread and can see where the model's
// memory of it starts.

export const COMPACTION_DIVIDER_ID = '__compaction_divider__'

const COMPACTION_DIVIDER_TEXT = 'Conversation compacted. The messages above are no longer sent to the model; a summary stands in for them.'

/** A message shown from the archive: the same message, marked so the list can dim it. */
function archived(message: Message): Message {
  return { ...message, metadata: { ...message.metadata, archived: true } }
}

/** The line between the archive and the conversation the model still sees. */
export function compactionDivider(): Message {
  return {
    id: COMPACTION_DIVIDER_ID,
    role: 'system',
    content: [{ type: 'text', text: COMPACTION_DIVIDER_TEXT }],
    metadata: { compactionDivider: true },
  }
}

export function isCompactionDivider(message: Message): boolean {
  return message.metadata?.compactionDivider === true
}

export function isArchivedMessage(message: Message): boolean {
  return message.metadata?.archived === true
}

/**
 * The messages to show: the archived ones (those that can be shown), a divider, then the current ones. Without any
 * archived message that can be shown, the current messages are returned unchanged and no divider is added.
 */
export function withArchivedHistory(
  archivedMessages: readonly Message[] | undefined,
  current: Message[],
  isRenderable: (message: Message) => boolean,
): Message[] {
  if (!archivedMessages || archivedMessages.length === 0) return current
  const shown = archivedMessages.filter(isRenderable).map(archived)
  if (shown.length === 0) return current
  return [...shown, compactionDivider(), ...current]
}
