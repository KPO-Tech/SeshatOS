import { memo } from 'react'
import { Copy, Down, Time, CheckOne, Redo } from '@icon-park/react'
import { MarkdownView } from '@renderer/components/MarkdownView'
import { NexusLogo } from '@renderer/components/NexusLogo'
import { useUIStore } from '@renderer/stores/ui'
import { ToolBlock } from '../tools/ToolBlock'
import { PermissionCard } from '../tools/PermissionCard'
import { AgentCardsRow } from '../tools/AgentToolView'
import { QuietToolGroup } from '../tools/QuietToolGroup'
import { THINKING_MARKDOWN_CLASS } from '../tools/thinkingMarkdownClass'
import { thinkingPreview } from './thinkingPreview'
import { breaksGroup } from '../tools/quietGroupPhrase'
import { isAgentTool, isGroupable } from '../tools/toolDisplay'
import { AttachmentThumb } from '../attachments/AttachmentThumb'
import type { Message, ToolUseBlock, ToolStatus } from '@renderer/api/types'
import type { ChatAttachment, StreamingBlock } from '@renderer/stores/session'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Tools that never appear as chat tool blocks - each has its own dedicated
// surface elsewhere so an inline line here would just be a redundant second
// copy of the same information:
// - mode-switching tools: silent, handled by the Computer panel
// - task_create/task_update/task_list: the live task list with per-item
//   status already lives in the Computer panel (auto-opened on
//   task_create - see useConversationPanels.ts), which is a far more useful view
//   than a growing wall of "Create Task"/"Update Task" lines for every
//   single item
const HIDDEN_TOOLS = new Set([
  'enter_plan_mode',
  'exit_plan_mode',
  'enter_pair_programming_mode',
  'exit_pair_programming_mode',
  'task_create',
  'task_update',
  'task_list',
])

// Messages that contain only tool_result blocks are synthetic turn-separator
// messages, not user-visible chat bubbles — skip them entirely.
function isToolResultOnly(msg: Message): boolean {
  return msg.role === 'user' && msg.content.length > 0 && msg.content.every(b => b.type === 'tool_result')
}

function messageAttachments(message: Message): ChatAttachment[] {
  const value = message.metadata?.attachments
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ChatAttachment => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as Partial<ChatAttachment>
    return typeof candidate.id === 'string' && typeof candidate.filename === 'string'
  })
}

export function isRenderableMessage(message: Message): boolean {
  if (isToolResultOnly(message)) return false
  if (messageAttachments(message).length > 0) return true
  return message.content.some((block) => {
    if (block.type === 'text') return Boolean(block.text.trim())
    if (block.type === 'thinking') return Boolean(block.thinking.trim())
    if (block.type === 'tool_use') return !HIDDEN_TOOLS.has(block.name)
    return false
  })
}

// ThinkingBlock isolates its own Zustand subscription so toggling one thinking
// block does NOT trigger re-renders in sibling MessageItems.
function ThinkingBlock({
  thinkingId,
  thinking,
  sessionId,
  revealThinking = false,
}: {
  thinkingId: string
  thinking: string
  sessionId?: string
  revealThinking?: boolean
}) {
  const storedExpansion = useUIStore((s) => s.thinkingExpansion[thinkingId])
  const expanded = storedExpansion ?? revealThinking
  const setThinkingExpansion = useUIStore((s) => s.setThinkingExpansion)
  const preview = expanded ? '' : thinkingPreview(thinking)
  return (
    <div className="flex flex-col">
      {/* Deliberately plain - no border/background box like a tool row. Just
          a quiet, italic line that expands into italic body text; the goal
          is "normal text that happens to fold", not another card. */}
      <div
        className="group inline-flex min-h-0 w-full cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-left text-[11.5px] italic leading-snug text-app-text-muted transition-colors duration-150 hover:text-app-text-secondary"
        role="button"
        tabIndex={0}
        onClick={() => setThinkingExpansion(thinkingId, !expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setThinkingExpansion(thinkingId, !expanded) } }}
        aria-expanded={expanded}
      >
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center not-italic text-app-text-muted">
          <Time size={11} />
        </span>
        <span className="flex-none">Thinking</span>
        {preview && (
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap opacity-70">
            — {preview}
          </span>
        )}
        <button
          type="button"
          className="ml-auto inline-flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent not-italic text-app-text-muted opacity-0 transition duration-150 hover:bg-[var(--color-hover)] hover:text-app-text group-hover:opacity-100"
          aria-label="Copy"
          onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(thinking) }}
        >
          <Copy size={10} />
        </button>
        <span className={cx('inline-flex shrink-0 items-center not-italic opacity-45 transition-transform duration-150', expanded && 'rotate-180')}>
          <Down size={10} />
        </span>
      </div>
      {expanded && (
        <div className="py-1 pl-[19px] pr-1 text-[12px] italic leading-[1.6] text-app-text-secondary">
          {/* Reasoning-model summaries (Codex/gpt-5's own reasoning_summary
              text) come back with the model's own markdown structure - a
              bold lead-in line, sometimes a blockquote - which otherwise
              renders at full heading/blockquote weight and blows up what's
              supposed to be a small, muted, italic aside into something
              that looks like its own card. These descendant classes neutralize that
              formatting back down to the same subdued style regardless of
              what markdown the model used. */}
          <MarkdownView className={THINKING_MARKDOWN_CLASS} sessionId={sessionId}>{thinking}</MarkdownView>
        </div>
      )}
    </div>
  )
}

type Props = {
  message: Message
  sessionId?: string
  // True only for the very first message in the whole conversation - each
  // message is virtualized inside its own row wrapper (see MessageList.tsx),
  // so every MessageItem is its wrapper's :first-child; a `first:` CSS
  // variant here would match every message, not just the conversation's
  // first one, and silently override the margin below on all of them.
  isFirst?: boolean
  compact?: boolean
  revealThinking?: boolean
  autoExpandTools?: boolean
  liveActivity?: {
    label: string
    detail?: string
  }
  justCompleted?: boolean
  onApproveTool?: (toolUseId: string, remember?: boolean) => void
  onDenyTool?: (toolUseId: string) => void
  onSubmitToolPrompt?: (promptId: string, value: unknown) => void
  // attachments carries along whatever files the original message had, so
  // retrying a failed send doesn't silently drop them - see metadata.attachments
  // below, populated by useChatStream.sendMessage on the original send.
  onRetryMessage?: (text: string, attachments?: ChatAttachment[]) => void
}

export type QuietGroupItem =
  | { kind: 'tool'; tool: ToolUseBlock }
  | { kind: 'thinking'; thinkingId: string; thinking: string }

export type RenderItem =
  | { kind: 'block'; block: Message['content'][number] | StreamingBlock; index: number }
  | { kind: 'agent-group'; tools: ToolUseBlock[] }
  | { kind: 'quiet-group'; items: QuietGroupItem[] }

// A tool_use block from either a persisted Message's content (ContentBlock)
// or the live streaming state (StreamingBlock) - structurally identical
// where it matters (id/name/input/_status/_result/...) so the same grouping
// logic (and the same QuietToolGroup timeline) works for both a finished
// message and a sub-agent's still-streaming activity feed (see
// SubagentPanel.tsx, the other caller of groupBlocks).
type GroupableBlock = Message['content'][number] | StreamingBlock

// messageId is only used to build the same `${messageId}-thinking-${index}`
// id a top-level ThinkingBlock would use for this position, so expansion
// state stays keyed consistently whether a thinking block ends up folded
// into a group or rendered standalone.
export function groupBlocks(blocks: GroupableBlock[], messageId: string): RenderItem[] {
  const items: RenderItem[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]

    if (block.type === 'tool_use' && isAgentTool(block.name)) {
      const group: ToolUseBlock[] = [block]
      let j = i + 1
      while (
        j < blocks.length &&
        blocks[j].type === 'tool_use' &&
        isAgentTool((blocks[j] as ToolUseBlock).name)
      ) {
        group.push(blocks[j] as ToolUseBlock)
        j++
      }
      items.push({ kind: 'agent-group', tools: group })
      i = j
      continue
    }

    if (
      block.type === 'tool_use' &&
      isGroupable(block.name) &&
      !breaksGroup(block)
    ) {
      const group: ToolUseBlock[] = [block]
      let j = i + 1
      while (true) {
        // A `thinking` block sitting between two groupable tool calls is
        // silent reasoning, not a message to the user - it doesn't end the
        // run any more than the tool calls themselves do. Skip over a run
        // of them (there can be more than one) to see if another groupable
        // tool follows; if not, leave j where it was and let them render as
        // normal standalone ThinkingBlocks after the group.
        let k = j
        while (k < blocks.length && blocks[k].type === 'thinking') k++
        if (
          k < blocks.length &&
          blocks[k].type === 'tool_use' &&
          isGroupable((blocks[k] as ToolUseBlock).name) &&
          !breaksGroup(blocks[k] as ToolUseBlock)
        ) {
          group.push(blocks[k] as ToolUseBlock)
          j = k + 1
          continue
        }
        break
      }
      // A lone tool (nothing simultaneous next to it - just text before or
      // after) gets the full standalone card via the normal 'block' path
      // below, not a quiet-group timeline. Grouping is only
      // useful once there are 2+ tools running back-to-back with no text
      // separating them.
      if (group.length > 1) {
        const groupItems: QuietGroupItem[] = []
        for (let idx = i; idx < j; idx++) {
          const b = blocks[idx]
          if (b.type === 'tool_use') groupItems.push({ kind: 'tool', tool: b })
          else if (b.type === 'thinking') {
            groupItems.push({ kind: 'thinking', thinkingId: `${messageId}-thinking-${idx}`, thinking: b.thinking })
          }
        }
        items.push({ kind: 'quiet-group', items: groupItems })
        i = j
        continue
      }
    }

    items.push({ kind: 'block', block, index: i })
    i++
  }
  return items
}


const LIVE_ACTIVITY_ROOT_CSS = 'mt-0.5 inline-flex min-w-0 items-center gap-[7px] text-app-text-secondary'
const LIVE_ACTIVITY_TEXT_CSS = 'min-w-0 truncate text-[12px] font-medium text-inherit [animation:msg-live-activity-fade_0.25s_ease]'

function LiveActivityBlock({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className={LIVE_ACTIVITY_ROOT_CSS} aria-live="polite">
      <NexusLogo size={16} className="shrink-0 [animation:msg-live-activity-pulse_1.8s_ease-in-out_infinite]" />
      <span className={LIVE_ACTIVITY_TEXT_CSS} key={`${label}-${detail ?? ''}`}>
        {label}{detail ? ` - ${detail}` : '...'}
      </span>
    </div>
  )
}

// Occupies the LiveActivityBlock's slot for a moment after a turn finishes -
// otherwise "done" is communicated purely by that line vanishing, with no
// acknowledgment the turn actually completed. Its parent clears justCompleted
// after ~1.5s (see Conversation.tsx), so this never needs its own timer.
function CompletionFlash() {
  return (
    <div className={cx(LIVE_ACTIVITY_ROOT_CSS, 'text-app-success [animation:msg-live-activity-fade_0.25s_ease]')} aria-live="polite">
      <CheckOne size={16} theme="filled" className="shrink-0" />
      <span className={LIVE_ACTIVITY_TEXT_CSS}>Done</span>
    </div>
  )
}

export const MessageItem = memo(function MessageItem({ message, sessionId, isFirst = false, compact = false, revealThinking = false, autoExpandTools = false, liveActivity, justCompleted = false, onApproveTool, onDenyTool, onSubmitToolPrompt, onRetryMessage }: Props) {
  const isUser = message.role === 'user'
  const attachments = messageAttachments(message)
  if (isToolResultOnly(message)) return null
  const visibleBlocks = message.content.filter((block) => {
    if (block.type === 'text') return Boolean(block.text.trim())
    if (block.type === 'thinking') return Boolean(block.thinking.trim())
    if (block.type === 'tool_use') return !HIDDEN_TOOLS.has(block.name)
    return false
  })
  if (visibleBlocks.length === 0 && attachments.length === 0 && !liveActivity && !justCompleted) return null
  const hasVisibleTool = visibleBlocks.some((block) => block.type === 'tool_use')

  const copyText = message.content
    .map((block) => {
      if (block.type === 'text') return block.text
      return ''
    })
    .filter(Boolean)
    .join('\n\n')

  const renderItems = groupBlocks(visibleBlocks, message.id ?? 'msg')

  return (
    <div
      className={cx(
        'group flex w-full items-start gap-3',
        isFirst ? 'mt-0' : compact ? 'mt-2' : 'mt-9',
        isUser && 'flex-row-reverse',
      )}
    >
      <div className={cx('flex min-w-0 flex-1 flex-col gap-1.5', isUser && 'max-w-[85%] items-end')}>
        {attachments.length > 0 && (
          <div className="flex max-w-full flex-nowrap gap-2 overflow-x-auto justify-end px-0.5 py-[5px]">
            {attachments.map((file) => (
              <AttachmentThumb key={file.id} file={file} size={48} />
            ))}
          </div>
        )}

        {renderItems.map((item, i) => {
          if (item.kind === 'agent-group') {
            return (
              <AgentCardsRow
                key={`${message.id ?? 'msg'}-agents-${i}`}
                tools={item.tools}
                sessionId={sessionId ?? ''}
                getStatus={(tool) => {
                  const status = tool._status
                  return (status ?? (tool._result ? (tool._result.isError ? 'failed' : 'completed') : 'running')) as ToolStatus
                }}
              />
            )
          }

          if (item.kind === 'quiet-group') {
            const firstToolId = item.items.find((it) => it.kind === 'tool')?.tool.id
            return (
              <QuietToolGroup
                key={firstToolId || `${message.id ?? 'msg'}-quiet-${i}`}
                items={item.items}
                sessionId={sessionId}
                revealThinking={revealThinking}
                autoExpandTools={autoExpandTools}
                onSubmitPrompt={onSubmitToolPrompt}
              />
            )
          }

          const block = item.block
          if (block.type === 'text') {
            return (
              <div
                key={`${message.id ?? 'msg'}-text-${item.index}`}
                className={cx(
                  'text-[14px] leading-[1.62] text-app-text',
                  isUser
                    ? 'rounded-[12px_12px_4px_12px] border border-app-border-subtle bg-app-surface px-[11px] py-[7px]'
                    : 'rounded-none border-0 bg-transparent p-0',
                  isUser && message.status === 'sending' && 'opacity-55',
                  isUser && message.status === 'error' && 'border-app-error',
                )}
              >
                <MarkdownView sessionId={sessionId}>{block.text}</MarkdownView>
                {isUser && message.status === 'error' && (
                  <button
                    type="button"
                    className="mt-1.5 block cursor-pointer border-0 bg-none p-0 text-left text-[12px] font-medium text-app-error hover:underline"
                    onClick={() => onRetryMessage?.(block.text, attachments)}
                  >
                    Failed to send · Retry
                  </button>
                )}
              </div>
            )
          }
          if (block.type === 'thinking') {
            const thinkingId = `${message.id ?? 'msg'}-thinking-${item.index}`
            return <ThinkingBlock key={thinkingId} thinkingId={thinkingId} thinking={block.thinking} sessionId={sessionId} revealThinking={revealThinking} />
          }
          if (block.type === 'tool_use') {
            const key = block.id || `${message.id ?? 'msg'}-tool-${item.index}`
            if (block._status === 'awaiting_approval') {
              return (
                <PermissionCard
                  key={key}
                  tool={block}
                  onApprove={onApproveTool}
                  onDeny={onDenyTool}
                />
              )
            }
            return (
              <ToolBlock
                key={key}
                tool={block}
                sessionId={sessionId}
                autoExpand={autoExpandTools}
                onSubmitPrompt={onSubmitToolPrompt}
              />
            )
          }
          if (block.type === 'tool_result') {
            return null
          }
          return null
        })}

        {liveActivity && <LiveActivityBlock label={liveActivity.label} detail={liveActivity.detail} />}
        {!liveActivity && justCompleted && <CompletionFlash />}

        {copyText && !hasVisibleTool && (
          <div className={cx('-mt-1 flex items-center gap-[7px] opacity-0 transition-opacity duration-200 group-hover:opacity-100', isUser && 'flex-row-reverse')}>
            <button
              className="flex cursor-pointer items-center rounded-app-xs border-0 bg-transparent p-0.5 text-app-text-muted hover:bg-[var(--color-hover)] hover:text-app-text-secondary"
              aria-label="Copy"
              type="button"
              onClick={() => {
                if (copyText) void navigator.clipboard.writeText(copyText)
              }}
            >
              <Copy size={11} />
            </button>
            {/* User messages only - re-sends the same text as a new prompt,
                same path the "Failed to send · Retry" link already uses
                below, just available on every message instead of only a
                failed one. */}
            {isUser && onRetryMessage && (
              <button
                className="flex cursor-pointer items-center rounded-app-xs border-0 bg-transparent p-0.5 text-app-text-muted hover:bg-[var(--color-hover)] hover:text-app-text-secondary"
                aria-label="Retry"
                title="Send this message again"
                type="button"
                onClick={() => onRetryMessage(copyText, attachments)}
              >
                <Redo size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
