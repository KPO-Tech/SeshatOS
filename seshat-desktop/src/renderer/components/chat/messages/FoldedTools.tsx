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
  /** null for a thought, which never summarizes with its neighbours. */
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
 * The tool work of a turn, grouped by what it is: "Read 13 files" is one line
 * that opens on the rows, and a lone call keeps its own row.
 */
export function FoldedTools({ items, sessionId, live = false, autoExpandTools = false, onSubmitPrompt }: Props) {
  const segments = useMemo(() => segmentsOf(items), [items])
  return (
    <div className="flex flex-col gap-1.5">
      {segments.map((segment) =>
        segment.kind === null || segment.items.length < 2 ? (
          <QuietToolGroup
            key={segment.key}
            items={segment.items}
            sessionId={sessionId}
            live={live}
            autoExpandTools={autoExpandTools}
            onSubmitPrompt={onSubmitPrompt}
          />
        ) : (
          <ToolRun
            key={segment.key}
            segment={segment}
            sessionId={sessionId}
            live={live}
            autoExpandTools={autoExpandTools}
            onSubmitPrompt={onSubmitPrompt}
          />
        ),
      )}
    </div>
  )
}

function ToolRun({ segment, sessionId, live, autoExpandTools, onSubmitPrompt }: Omit<Props, 'items'> & { segment: Segment }) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const tools = segment.items.filter((item): item is Extract<FoldedToolItem, { kind: 'tool' }> => item.kind === 'tool')
  const count = tools.length
  const kind = segment.kind ?? 'other'
  const first = tools[0]

  // One line per kind of work instead of one line per call: a dozen reads are a
  // dozen rows of the same thing, and the fold exists to give the answer room.
  // Each key is written out, because a key built from a variable cannot be
  // checked against the catalogues (see scripts/i18n-scan.mjs). i18next picks
  // the plural form of the base key.
  function summary(): string {
    switch (kind) {
      case 'read': return t('chat.messages.foldedTools.read', { count })
      case 'search': return t('chat.messages.foldedTools.search', { count })
      case 'edit': return t('chat.messages.foldedTools.edit', { count })
      case 'write': return t('chat.messages.foldedTools.write', { count })
      case 'bash': return t('chat.messages.foldedTools.bash', { count })
      default: return t('chat.messages.foldedTools.other', { count, label: first ? toolLabel(first.tool.name) : '' })
    }
  }

  return (
    <div className="flex flex-col">
      <div
        className="group inline-flex min-h-0 w-full cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-left text-[11.5px] leading-snug text-app-text-muted transition-colors duration-150 hover:text-app-text"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={t(open ? 'chat.messages.foldedTools.hideThese' : 'chat.messages.foldedTools.showThese')}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((value) => !value) } }}
      >
        <span className="flex-none">{summary()}</span>
        <span className={cx('inline-flex shrink-0 items-center opacity-45 transition-transform duration-150', open && 'rotate-180')}>
          <Down size={10} />
        </span>
      </div>
      {open && (
        <QuietToolGroup
          items={segment.items}
          sessionId={sessionId}
          live={live}
          autoExpandTools={autoExpandTools}
          onSubmitPrompt={onSubmitPrompt}
        />
      )}
    </div>
  )
}
