import { Down, Time } from '@icon-park/react'
import { useUIStore } from '@renderer/stores/ui'
import { MarkdownView } from '@renderer/components/MarkdownView'
import { SilentToolView } from './renderers/SilentToolView'
import { ToolLineItem } from './ToolLineItem'
import { THINKING_MARKDOWN_CLASS } from './thinkingMarkdownClass'
import { thinkingPreview } from '../messages/thinkingPreview'
import { toolStatus } from './quietGroupPhrase'
import { isSilentTool, toolSnippet } from './toolDisplay'
import type { ToolBlockProps } from './types'
import type { QuietGroupItem } from '../messages/MessageItem'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type Props = {
  items: QuietGroupItem[]
  sessionId?: string
  revealThinking?: boolean
  autoExpandTools?: boolean
  onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']
}

// A run of 2+ tools (or tools interleaved with thinking blocks) with no text
// between them - rendered as a single always-visible timeline, one dot per
// step on a shared vertical line, instead of hidden behind a "3 tools ran"
// summary someone has to click to see anything. Each step keeps its own
// expand-for-details affordance (ToolLineItem/SilentToolView/thinking below)
// - only the outer "collapse the whole run into one line" behavior is gone.
export function QuietToolGroup({ items, sessionId, revealThinking = false, autoExpandTools = false, onSubmitPrompt }: Props) {
  return (
    <div className="m-0 flex flex-col">
      <div className="m-0 flex flex-col gap-1.5">
        {items.map((item) => {
          if (item.kind === 'thinking') {
            return <ThinkingGroupItem key={item.thinkingId} thinkingId={item.thinkingId} thinking={item.thinking} sessionId={sessionId} revealThinking={revealThinking} />
          }
          const tool = item.tool
          const status = toolStatus(tool)
          // A silent tool already renders a complete, self-sufficient line
          // via SilentToolView - wrapping that in ToolLineItem's own
          // header/expand-toggle would just double up the same
          // information in two nested rows for no reason.
          if (isSilentTool(tool.name)) {
            return (
              <SilentToolView
                key={tool.id}
                tool={tool}
                result={tool._result}
                status={status}
                snippet={toolSnippet(tool)}
                sessionId={sessionId}
              />
            )
          }
          return (
            <ToolLineItem
              key={tool.id}
              tool={tool}
              sessionId={sessionId}
              autoExpand={autoExpandTools}
              onSubmitPrompt={onSubmitPrompt}
            />
          )
        })}
      </div>
    </div>
  )
}

// Folded into a group's item list wherever a thinking block sits between two
// groupable tool calls (see groupBlocks in MessageItem.tsx) - same plain,
// italic, collapsible treatment as the standalone ThinkingBlock so a
// grouped thought doesn't look like a different kind of thing.
function ThinkingGroupItem({
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

  function toggle() {
    setThinkingExpansion(thinkingId, !expanded)
  }

  return (
    <div className="flex flex-col">
      <div
        className="group inline-flex min-h-0 w-full cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-left text-[11.5px] italic leading-snug text-app-text-muted transition-colors duration-150 hover:text-app-text-secondary"
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
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
        <span className={cx('ml-auto inline-flex shrink-0 items-center not-italic opacity-45 transition-transform duration-150', expanded && 'rotate-180')}>
          <Down size={10} />
        </span>
      </div>
      {expanded && (
        <div className="py-1 pl-[19px] pr-1 text-[12px] italic leading-[1.6] text-app-text-secondary">
          <MarkdownView className={THINKING_MARKDOWN_CLASS} sessionId={sessionId}>{thinking}</MarkdownView>
        </div>
      )}
    </div>
  )
}
