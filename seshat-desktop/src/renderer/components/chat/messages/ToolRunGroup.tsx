import { useMemo, useState } from 'react'
import { Down } from '@icon-park/react'
import { useTranslation } from 'react-i18next'
import { QuietToolGroup } from '../tools/QuietToolGroup'
import { toolCategory, toolLabel, type ToolCategory } from '../tools/toolDisplay'
import type { ToolBlockProps } from '../tools/types'
import type { FoldedToolItem } from './turns'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type Segment = {
  key: string
  /** null for a thought, which never merges with the calls around it. */
  kind: ToolCategory | null
  items: FoldedToolItem[]
}

/** What a call counts as when deciding whether it belongs with the one before it. */
function groupKey(item: FoldedToolItem): string | null {
  if (item.kind !== 'tool') return null
  const category = toolCategory(item.tool.name)
  // Two unrelated tools in the "other" bucket are not the same work.
  return category === 'other' ? `other:${toolLabel(item.tool.name)}` : category
}

function segmentsOf(items: FoldedToolItem[]): Segment[] {
  const segments: Segment[] = []
  for (const item of items) {
    const key = groupKey(item)
    const last = segments[segments.length - 1]
    if (key !== null && last && last.kind !== null && groupKey(last.items[0]) === key) {
      last.items.push(item)
      continue
    }
    const kind = item.kind === 'tool' ? toolCategory(item.tool.name) : null
    segments.push({ key: `${key ?? 'thinking'}-${segments.length}`, kind, items: [item] })
  }
  return segments
}

type Props = {
  items: FoldedToolItem[]
  sessionId?: string
  live?: boolean
  autoExpandTools?: boolean
  onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']
}

/**
 * A run of consecutive tool calls: one line that says what the run did ("Read
 * files, edited files, ran a command"), opened into the calls themselves. The
 * rows of the same kind merge ("Edit · 2 calls"), because three edits in a row
 * are one thing to read, not three.
 *
 * While the turn runs, the run stays open: watching it work is the point.
 */
export function ToolRunGroup({ items, sessionId, live = false, autoExpandTools = false, onSubmitPrompt }: Props) {
  const { t } = useTranslation('chat')
  const segments = useMemo(() => segmentsOf(items), [items])
  const [open, setOpen] = useState<boolean | null>(null)
  const expanded = open ?? live

  // A single call says nothing a summary could shorten.
  if (items.length < 2) {
    return <QuietToolGroup items={items} sessionId={sessionId} live={live} autoExpandTools={autoExpandTools} onSubmitPrompt={onSubmitPrompt} />
  }

  const kinds = [...new Set(segments.map((segment) => segment.kind).filter((kind): kind is ToolCategory => kind !== null))]

  // Each key is written out, because a key built from a variable cannot be
  // checked against the catalogues (see scripts/i18n-scan.mjs).
  function partOf(kind: ToolCategory): string {
    switch (kind) {
      case 'read': return t('chat.messages.toolRun.read')
      case 'search': return t('chat.messages.toolRun.search')
      case 'edit': return t('chat.messages.toolRun.edit')
      case 'write': return t('chat.messages.toolRun.write')
      case 'bash': return t('chat.messages.toolRun.bash')
      default: return t('chat.messages.toolRun.other')
    }
  }

  const phrase = kinds.length === 0 ? t('chat.messages.toolRun.thought') : kinds.map(partOf).join(', ')

  return (
    <div className="flex flex-col">
      <div
        className="group inline-flex min-h-0 w-full cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-left text-[11.5px] leading-snug text-app-text-muted transition-colors duration-150 hover:text-app-text"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={t(expanded ? 'chat.messages.toolRun.hide' : 'chat.messages.toolRun.show')}
        onClick={() => setOpen(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!expanded) } }}
      >
        <span className="flex-none">{phrase}</span>
        <span className={cx('inline-flex shrink-0 items-center opacity-45 transition-transform duration-150', expanded && 'rotate-180')}>
          <Down size={10} />
        </span>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1">
          {segments.map((segment) => (
            <SegmentRow
              key={segment.key}
              segment={segment}
              sessionId={sessionId}
              live={live}
              autoExpandTools={autoExpandTools}
              onSubmitPrompt={onSubmitPrompt}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SegmentRow({ segment, sessionId, live, autoExpandTools, onSubmitPrompt }: Omit<Props, 'items'> & { segment: Segment }) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const tools = segment.items.filter((item): item is Extract<FoldedToolItem, { kind: 'tool' }> => item.kind === 'tool')
  const first = tools[0]

  if (tools.length < 2 || !first) {
    return <QuietToolGroup items={segment.items} sessionId={sessionId} live={live} autoExpandTools={autoExpandTools} onSubmitPrompt={onSubmitPrompt} />
  }

  const label = t('chat.messages.toolRun.call', { count: tools.length, label: toolLabel(first.tool.name) })

  return (
    <div className="flex flex-col">
      <div
        className="inline-flex min-h-0 w-full cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11.5px] leading-snug text-app-text-muted transition-colors duration-150 hover:text-app-text"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((value) => !value) } }}
      >
        <span className="flex-none">{label}</span>
        <span className={cx('inline-flex shrink-0 items-center opacity-45 transition-transform duration-150', open && 'rotate-180')}>
          <Down size={10} />
        </span>
      </div>
      {open && (
        <QuietToolGroup items={segment.items} sessionId={sessionId} live={live} autoExpandTools={autoExpandTools} onSubmitPrompt={onSubmitPrompt} />
      )}
    </div>
  )
}
