import type { ComponentType } from 'react'
import { isNode } from '../../lang/parseUi'
import { MarkdownText } from '../text/MarkdownText'
import type { ComponentProps } from '../NodeView'

const STATUS_MARK: Record<string, string> = { todo: '', doing: '...', done: 'ok', blocked: '!' }
const STATUS_CLASS: Record<string, string> = {
  todo: 'border-app-border text-app-text-muted',
  doing: 'border-app-primary text-app-primary',
  done: 'border-app-success bg-app-success/15 text-app-success',
  blocked: 'border-app-error bg-app-error/15 text-app-error'
}

function Steps({ props }: ComponentProps) {
  const items = Array.isArray(props.items) ? props.items.filter(isNode) : []
  return (
    <ol className="my-3 flex list-none flex-col gap-3 p-0">
      {items.map((step, index) => {
        const status = typeof step.props.status === 'string' ? step.props.status : 'todo'
        return (
          <li key={index} className="flex gap-3">
            <span className={`mt-px flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border px-1 text-[11px] font-semibold ${STATUS_CLASS[status]}`}>
              {STATUS_MARK[status] || index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-app-text">{String(step.props.title)}</div>
              {typeof step.props.body === 'string' && <MarkdownText text={step.props.body} className="mt-0.5 text-[13px] text-app-text-secondary" />}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export const guidanceComponents: Record<string, ComponentType<ComponentProps>> = { Steps }
