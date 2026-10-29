import type { ComponentType } from 'react'
import { useState } from 'react'
import { isNode } from '../../lang/parseUi'
import type { UiAction } from '../../lang/types'
import { actionState, readAction, runAction, useRichActionBridge } from '../actions/richActions'
import { MarkdownText } from '../text/MarkdownText'
import type { ComponentProps } from '../NodeView'

function Button({ props }: ComponentProps) {
  const bridge = useRichActionBridge()
  const action = readAction(props.action)
  const { enabled, why } = actionState(action, bridge)
  const primary = props.variant !== 'secondary'
  return (
    <button
      type="button"
      disabled={!enabled}
      title={why}
      onClick={() => runAction(action, bridge)}
      className={`my-1 mr-2 inline-flex w-fit cursor-pointer items-center rounded-lg border px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? 'border-[rgba(239,124,47,0.35)] bg-[rgba(239,124,47,0.12)] text-[var(--accent-primary)] hover:enabled:bg-[rgba(239,124,47,0.2)]'
          : 'border-app-border-subtle bg-transparent text-app-text-secondary hover:enabled:bg-[var(--surface-hover)] hover:enabled:text-app-text'
      }`}
    >
      {String(props.label)}
    </button>
  )
}

function Choices({ props }: ComponentProps) {
  const bridge = useRichActionBridge()
  const [picked, setPicked] = useState<number | null>(null)
  const options = (Array.isArray(props.options) ? props.options : []).filter(isNode)
  return (
    <div className="my-3">
      {typeof props.title === 'string' && <div className="mb-1.5 text-xs text-app-text-muted">{props.title}</div>}
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const action = readAction(option.props.action)
          const { enabled, why } = actionState(action, bridge)
          const chosen = picked === index
          return (
            <button
              key={index}
              type="button"
              disabled={!enabled}
              title={why}
              onClick={() => {
                setPicked(index)
                runAction(action, bridge)
              }}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                chosen
                  ? 'border-[rgba(239,124,47,0.4)] bg-[rgba(239,124,47,0.12)] text-[var(--accent-primary)]'
                  : 'border-app-border-subtle bg-transparent text-app-text-secondary hover:enabled:bg-[var(--surface-hover)] hover:enabled:text-app-text'
              }`}
            >
              {String(option.props.label)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// A Choice is read by its Choices, which draws it: on its own it draws nothing.
function ReadByChoices() {
  return null
}

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

function FileRef({ props }: ComponentProps) {
  const path = String(props.path)
  const place = typeof props.line === 'number' ? `:${props.line}` : typeof props.page === 'number' ? ` p.${props.page}` : ''
  const action: UiAction = { kind: 'action', name: 'OpenFile', args: [path] }
  const bridge = useRichActionBridge()
  return (
    <button
      type="button"
      title={path}
      onClick={() => runAction(action, bridge)}
      className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-app-border-subtle bg-app-surface px-2 py-0.5 font-mono text-[12px] text-app-text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-app-text"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 1.75h5.5L13 5.25v9H4z M9.5 1.75v3.5H13" />
      </svg>
      <span className="truncate">
        {typeof props.label === 'string' ? props.label : baseName(path)}
        {place}
      </span>
    </button>
  )
}

function Link({ props }: ComponentProps) {
  const bridge = useRichActionBridge()
  const action: UiAction = { kind: 'action', name: 'OpenUrl', args: [String(props.url)] }
  return (
    <a
      href={String(props.url)}
      title={String(props.url)}
      onClick={(event) => {
        event.preventDefault()
        runAction(action, bridge)
      }}
      className="cursor-pointer text-[var(--accent-primary)] underline-offset-2 hover:underline"
    >
      {String(props.label)}
    </a>
  )
}

function Citation({ props }: ComponentProps) {
  const place = typeof props.page === 'number' ? `, p. ${props.page}` : ''
  return (
    <div className="my-3 rounded-lg border border-app-border-subtle bg-app-surface px-3.5 py-2.5">
      <div className="text-[12px] font-semibold text-app-text-secondary">
        {String(props.label)}
        <span className="font-normal text-app-text-muted">
          {' '}
          {String(props.source)}
          {place}
        </span>
      </div>
      {typeof props.quote === 'string' && <MarkdownText text={props.quote} className="mt-1 border-0 border-l-2 border-solid border-app-border pl-2.5 text-[13px] italic text-app-text-secondary" />}
    </div>
  )
}

function SourceList({ props }: ComponentProps) {
  const bridge = useRichActionBridge()
  const sources = (Array.isArray(props.sources) ? props.sources : []).filter(isNode)
  return (
    <ol className="my-3 flex list-none flex-col gap-1.5 p-0">
      {sources.map((source, index) => {
        const url = typeof source.props.url === 'string' ? source.props.url : undefined
        const path = typeof source.props.path === 'string' ? source.props.path : undefined
        const action: UiAction | null = url ? { kind: 'action', name: 'OpenUrl', args: [url] } : path ? { kind: 'action', name: 'OpenFile', args: [path] } : null
        return (
          <li key={index} className="flex gap-2 text-[13px]">
            <span className="w-5 shrink-0 text-right text-app-text-muted">{index + 1}.</span>
            <div className="min-w-0">
              {action ? (
                <button type="button" onClick={() => runAction(action, bridge)} className="cursor-pointer border-0 bg-transparent p-0 text-left text-[var(--accent-primary)] hover:underline">
                  {String(source.props.title)}
                </button>
              ) : (
                <span className="text-app-text">{String(source.props.title)}</span>
              )}
              {typeof source.props.note === 'string' && <span className="text-app-text-muted"> {source.props.note}</span>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// A Source is read by its SourceList, which draws it: on its own it draws nothing.
function ReadBySourceList() {
  return null
}

export const interactionComponents: Record<string, ComponentType<ComponentProps>> = {
  Button,
  Choices,
  Choice: ReadByChoices,
  FileRef,
  Link,
  Citation,
  SourceList,
  Source: ReadBySourceList
}
